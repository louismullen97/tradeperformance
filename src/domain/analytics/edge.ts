import { summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import { MIN_TAG_SAMPLE } from './analytics';
import { DIMENSIONS, type Dimension } from './dimensions';

// ── Tag groups (things recorded per trade in the journal) ────────────────

const list = (t: StandardTrade, key: string): string[] => {
  const v = t.optional[key];
  return Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\s*,\s*/) : [];
};

/** Tag-like groups, expressed as dimensions so every analysis can treat them alike. */
export const TAG_GROUPS: Dimension[] = [
  { key: 'positive_tags', label: 'Positive tags', values: (t) => list(t, 'positive_tags') },
  { key: 'negative_tags', label: 'Negative tags', values: (t) => list(t, 'negative_tags') },
  { key: 'psychology_tags', label: 'Psychology', values: (t) => list(t, 'psychology_tags') },
  { key: 'tags', label: 'Other tags', values: (t) => list(t, 'tags') },
  {
    key: 'execution_rating',
    label: 'Trade rating',
    values: (t) => (typeof t.optional.execution_rating === 'number' ? [`${Math.round(t.optional.execution_rating)}/5`] : []),
    order: ['5/5', '4/5', '3/5', '2/5', '1/5'],
  },
];

export function availableTagGroups(trades: StandardTrade[]): Dimension[] {
  return TAG_GROUPS.filter((g) => trades.some((t) => g.values(t).length > 0));
}

function values(trades: StandardTrade[], dim: Dimension, limit?: number): string[] {
  const counts = new Map<string, number>();
  for (const t of trades) for (const v of dim.values(t)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = dim.order ? dim.order.filter((k) => counts.has(k)) : [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  return limit ? keys.slice(0, limit) : keys;
}

// ── Tags matrix: a trade dimension × a tag group ────────────────────────

export interface MatrixCell {
  stats: TradeSummary;
}

export interface TagMatrix {
  rows: string[];
  cols: string[];
  cell: (row: string, col: string) => MatrixCell;
  /** Row totals regardless of tag, for context. */
  rowTotal: (row: string) => TradeSummary;
}

export function tagMatrix(trades: StandardTrade[], rowDim: Dimension, colDim: Dimension, maxCols = 8): TagMatrix {
  const rows = values(trades, rowDim);
  const cols = values(trades, colDim, maxCols);
  const cache = new Map<string, MatrixCell>();
  return {
    rows,
    cols,
    cell(row, col) {
      const k = `${row}\u0000${col}`;
      let c = cache.get(k);
      if (!c) {
        c = { stats: summarise(trades.filter((t) => rowDim.values(t).includes(row) && colDim.values(t).includes(col))) };
        cache.set(k, c);
      }
      return c;
    },
    rowTotal: (row) => summarise(trades.filter((t) => rowDim.values(t).includes(row))),
  };
}

// ── Edge ─────────────────────────────────────────────────────────────────

export interface Segment {
  key: string;
  /** e.g. [{ dimension: 'Setup', value: '3 Touch' }, { dimension: 'Timeframe', value: '15m' }] */
  factors: { dimension: string; value: string }[];
  stats: TradeSummary;
  /**
   * Expectancy shrunk toward the overall average in proportion to sample size,
   * so a 2-trade fluke can't outrank a 20-trade pattern.
   */
  score: number;
}

/** Strength of the pull toward the overall average (in trades). */
export const SHRINK_TRADES = 5;

const ROW_DIMS = ['setup', 'strategy', 'timeframe', 'trading_session', 'management_style', 'currency_pair', 'direction', 'entry_type', 'weekday'];

export interface EdgeReport {
  overall: TradeSummary;
  edge: Segment[];
  needsWork: Segment[];
  /** Best qualifying value per dimension — the profile of an A+ trade. */
  profile: { dimension: string; segment: Segment }[];
  minSample: number;
}

export function edgeAnalysis(trades: StandardTrade[], opts: { minSample?: number; limit?: number } = {}): EdgeReport {
  const minSample = opts.minSample ?? MIN_TAG_SAMPLE;
  const limit = opts.limit ?? 6;
  const overall = summarise(trades);
  const base = overall.avgR ?? 0;
  const dims = [...DIMENSIONS.filter((d) => ROW_DIMS.includes(d.key)), ...TAG_GROUPS].filter((d) => trades.some((t) => d.values(t).length));
  const segments: Segment[] = [];

  const add = (factors: { dim: Dimension; value: string }[]) => {
    const group = trades.filter((t) => factors.every((f) => f.dim.values(t).includes(f.value)));
    if (group.length < minSample) return;
    const stats = summarise(group);
    const n = group.length;
    segments.push({
      key: factors.map((f) => `${f.dim.key}=${f.value}`).join('&'),
      factors: factors.map((f) => ({ dimension: f.dim.label, value: f.value })),
      stats,
      score: Math.round((((stats.avgR ?? 0) * n + base * SHRINK_TRADES) / (n + SHRINK_TRADES)) * 1000) / 1000,
    });
  };

  // Single factors
  const singles = new Map<string, Segment[]>();
  for (const d of dims) {
    const before = segments.length;
    for (const v of values(trades, d)) add([{ dim: d, value: v }]);
    singles.set(d.label, segments.slice(before));
  }
  // Pairs anchored on setup (the trader's core decision), plus timeframe × session.
  const setup = dims.find((d) => d.key === 'setup');
  const pairs: [Dimension, Dimension][] = [];
  if (setup) for (const d of dims) if (d !== setup) pairs.push([setup, d]);
  const tf = dims.find((d) => d.key === 'timeframe');
  const sess = dims.find((d) => d.key === 'trading_session');
  if (tf && sess) pairs.push([tf, sess]);
  for (const [a, b] of pairs) for (const va of values(trades, a)) for (const vb of values(trades, b)) add([{ dim: a, value: va }, { dim: b, value: vb }]);

  const edge = segments
    .filter((s) => (s.stats.avgR ?? 0) > 0 && s.stats.netR > 0 && s.score > base)
    .sort((a, b) => b.score - a.score || b.stats.count - a.stats.count)
    .slice(0, limit);
  const needsWork = segments
    .filter((s) => (s.stats.avgR ?? 0) < 0 && s.stats.netR < 0)
    .sort((a, b) => a.score - b.score || b.stats.count - a.stats.count)
    .slice(0, limit);

  const profile: EdgeReport['profile'] = [];
  for (const key of ['strategy', 'setup', 'timeframe', 'trading_session', 'management_style', 'psychology_tags', 'execution_rating']) {
    const d = dims.find((x) => x.key === key);
    if (!d) continue;
    // A single strategy says nothing about where the edge is.
    if (key === 'strategy' && new Set(trades.flatMap(d.values)).size < 2) continue;
    const best = (singles.get(d.label) ?? []).filter((s) => (s.stats.avgR ?? 0) > 0).sort((a, b) => b.score - a.score)[0];
    if (best) profile.push({ dimension: d.label, segment: best });
  }

  return { overall, edge, needsWork, profile, minSample };
}
