import { cumulativeR, outcomeOf, summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import { amountOf } from '../trades/summary';
import { distinctValues, type Dimension } from './dimensions';
import { tagGroups } from '../tags/tags';

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const byDate = (a: StandardTrade, b: StandardTrade) => a.trade_date.localeCompare(b.trade_date) || a.id.localeCompare(b.id);

// ── Filtering ──────────────────────────────────────────────────────────

export interface TradeFilter {
  /** Dimension key → accepted values (empty or missing = no filter). */
  dims: Record<string, string>;
  from?: string; // inclusive ISO date
  to?: string; // inclusive ISO date
}

export function applyFilter(trades: StandardTrade[], filter: TradeFilter, dims: Dimension[]): StandardTrade[] {
  return trades.filter((t) => {
    if (filter.from && t.trade_date < filter.from) return false;
    if (filter.to && t.trade_date > filter.to) return false;
    for (const d of dims) {
      const want = filter.dims[d.key];
      if (want && !d.values(t).includes(want)) return false;
    }
    return true;
  });
}

// ── Risk & consistency ────────────────────────────────────────────────

export interface PerformanceStats extends TradeSummary {
  /** Largest peak-to-trough fall of cumulative R. Reported as a positive number. */
  maxDrawdownR: number;
  /** Current distance below the running peak, in R. */
  currentDrawdownR: number;
  longestWinStreak: number;
  longestLossStreak: number;
  bestTradeR: number | null;
  worstTradeR: number | null;
  tradingDays: number;
}

export function performance(trades: StandardTrade[]): PerformanceStats {
  const sorted = [...trades].sort(byDate);
  let peak = 0;
  let maxDd = 0;
  let equity = 0;
  for (const p of cumulativeR(sorted)) {
    equity = p.r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  let win = 0;
  let loss = 0;
  let bestWin = 0;
  let bestLoss = 0;
  for (const t of sorted) {
    const o = outcomeOf(t);
    if (o === 'win') {
      win++;
      loss = 0;
    } else if (o === 'loss') {
      loss++;
      win = 0;
    } // breakevens don't break or extend a streak
    bestWin = Math.max(bestWin, win);
    bestLoss = Math.max(bestLoss, loss);
  }

  const rs = sorted.map((t) => t.result_r);
  return {
    ...summarise(sorted),
    maxDrawdownR: round(maxDd),
    currentDrawdownR: round(peak - equity),
    longestWinStreak: bestWin,
    longestLossStreak: bestLoss,
    bestTradeR: rs.length ? Math.max(...rs) : null,
    worstTradeR: rs.length ? Math.min(...rs) : null,
    tradingDays: new Set(sorted.map((t) => t.trade_date)).size,
  };
}

// ── Breakdown by dimension ───────────────────────────────────────────

export interface BreakdownRow {
  value: string;
  stats: TradeSummary;
  /** Share of all trades in the set. */
  share: number;
}

export function breakdown(trades: StandardTrade[], dim: Dimension): BreakdownRow[] {
  return distinctValues(trades, dim).map((value) => {
    const group = trades.filter((t) => dim.values(t).includes(value));
    return { value, stats: summarise(group), share: trades.length ? group.length / trades.length : 0 };
  });
}

// ── Calendar ─────────────────────────────────────────────────────────

export interface DayStats {
  date: string;
  trades: StandardTrade[];
  count: number;
  netR: number;
  netPl: number;
  netAmount: number | null;
  wins: number;
  losses: number;
}

export function dailyStats(trades: StandardTrade[]): Map<string, DayStats> {
  const days = new Map<string, DayStats>();
  for (const t of [...trades].sort(byDate)) {
    const d = days.get(t.trade_date) ?? {
      date: t.trade_date,
      trades: [],
      count: 0,
      netR: 0,
      netPl: 0,
      netAmount: null,
      wins: 0,
      losses: 0,
    };
    d.trades.push(t);
    d.count++;
    d.netR = round(d.netR + t.result_r);
    d.netPl = round(d.netPl + t.profit_loss_percentage);
    const amt = amountOf(t);
    if (amt !== null) d.netAmount = round((d.netAmount ?? 0) + amt, 2);
    const o = outcomeOf(t);
    if (o === 'win') d.wins++;
    if (o === 'loss') d.losses++;
    days.set(t.trade_date, d);
  }
  return days;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday-first weeks covering the month; days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(new Date(Date.UTC(year, month, d))));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ── Tag difference analysis ──────────────────────────────────────────

/** A group of tags (behaviour, technical, psychology, custom columns, …). */
export type TagSource = Dimension;

export interface TagRow {
  tag: string;
  source: string;
  trades: number;
  /** % of winning trades that carry the tag (0–1). */
  inWins: number;
  /** % of losing trades that carry the tag (0–1). */
  inLosses: number;
  /** inWins − inLosses, in percentage points (−1…1). Positive = more common on winners. */
  difference: number;
  winRateWith: number | null;
  winRateWithout: number | null;
  avgRWith: number | null;
  avgRWithout: number | null;
  /** Fewer than MIN_TAG_SAMPLE trades carry this tag — treat as anecdotal. */
  lowSample: boolean;
}

export const MIN_TAG_SAMPLE = 5;

export function tagDifference(trades: StandardTrade[], sources: TagSource[]): TagRow[] {
  const wins = trades.filter((t) => outcomeOf(t) === 'win');
  const losses = trades.filter((t) => outcomeOf(t) === 'loss');
  const rows: TagRow[] = [];

  for (const src of sources) {
    const tags = new Set(trades.flatMap((t) => src.values(t)));
    for (const tag of tags) {
      const has = (t: StandardTrade) => src.values(t).includes(tag);
      const withTag = trades.filter(has);
      const without = trades.filter((t) => !has(t));
      const sw = summarise(withTag);
      const so = summarise(without);
      const inWins = wins.length ? wins.filter(has).length / wins.length : 0;
      const inLosses = losses.length ? losses.filter(has).length / losses.length : 0;
      rows.push({
        tag,
        source: src.label,
        trades: withTag.length,
        inWins: round(inWins),
        inLosses: round(inLosses),
        difference: round(inWins - inLosses),
        winRateWith: sw.winRate,
        winRateWithout: so.winRate,
        avgRWith: sw.avgR,
        avgRWithout: so.avgR,
        lowSample: withTag.length < MIN_TAG_SAMPLE,
      });
    }
  }
  return rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || b.trades - a.trades);
}

/** Tag groups present in the data, in a stable order. */
export function availableTagSources(trades: StandardTrade[]): TagSource[] {
  return tagGroups(trades);
}

// ── Date presets ─────────────────────────────────────────────────────

export type RangePreset = 'all' | '30d' | '90d' | 'month' | 'ytd';

export function presetRange(preset: RangePreset, today: Date = new Date()): { from?: string; to?: string } {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const minus = (days: number) => iso(new Date(t.getTime() - days * 86_400_000));
  switch (preset) {
    case '30d':
      return { from: minus(29) };
    case '90d':
      return { from: minus(89) };
    case 'month':
      return { from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))) };
    case 'ytd':
      return { from: `${t.getUTCFullYear()}-01-01` };
    default:
      return {};
  }
}

// ── Dimension highlights ─────────────────────────────────────────────

export interface DimensionHighlights {
  best: BreakdownRow | null;
  worst: BreakdownRow | null;
  mostFrequent: BreakdownRow | null;
  leastFrequent: BreakdownRow | null;
  rows: BreakdownRow[];
}

/**
 * Best/least performing are ranked by net R (ties → expectancy). With a single
 * group there is nothing to compare, so worst/least are null.
 */
export function dimensionHighlights(trades: StandardTrade[], dim: Dimension): DimensionHighlights {
  const rows = breakdown(trades, dim);
  if (!rows.length) return { best: null, worst: null, mostFrequent: null, leastFrequent: null, rows };
  const byPerf = [...rows].sort((a, b) => b.stats.netR - a.stats.netR || (b.stats.avgR ?? 0) - (a.stats.avgR ?? 0));
  const byCount = [...rows].sort((a, b) => b.stats.count - a.stats.count || b.stats.netR - a.stats.netR);
  const many = rows.length > 1;
  return {
    best: byPerf[0],
    worst: many ? byPerf[byPerf.length - 1] : null,
    mostFrequent: byCount[0],
    leastFrequent: many ? byCount[byCount.length - 1] : null,
    rows,
  };
}

// ── Daily equity series ──────────────────────────────────────────────

export interface DailyEquityPoint {
  date: string;
  /** Cumulative R at the end of the day. */
  r: number;
  /** R made that day. */
  dayR: number;
  trades: number;
}

export function dailyEquity(trades: StandardTrade[]): DailyEquityPoint[] {
  let total = 0;
  return [...dailyStats(trades).values()].map((d) => {
    total = round(total + d.netR);
    return { date: d.date, r: total, dayR: d.netR, trades: d.count };
  });
}
