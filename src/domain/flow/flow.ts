import type { FieldDefinition } from '../fields/types';
import type { SourceKind } from '../source/types';
import { outcomeOf, summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';

/**
 * Flow Zone: a self-rated 1–10 score logged once or several times a day,
 * independent of trades, with tags for what lifted or drained it.
 */
export const FLOW_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'date',
    label: 'Date',
    description: 'Day of the check-in.',
    required: true,
    valueKind: 'date',
    group: 'core',
    aliases: ['Date', 'Day', 'Check-in Date', 'Check-in', 'Logged'],
    example: '2026-11-24',
  },
  {
    key: 'flow_score',
    label: 'Flow score',
    description: 'How in-flow you felt, 1–10.',
    required: true,
    valueKind: 'number',
    group: 'core',
    aliases: ['Flow', 'Flow Score', 'Flow Zone', 'Flow Rating', 'Score', 'Rating'],
    plausibleRange: { min: 0, max: 10 },
    example: '7',
  },
  {
    key: 'time_of_day',
    label: 'Time of day',
    description: 'When in the day the score was logged (e.g. Morning, Midday, Afternoon).',
    required: false,
    valueKind: 'string',
    group: 'context',
    aliases: ['Time of Day', 'Time', 'Check-in Time', 'Period', 'Session', 'Slot'],
    example: 'Morning',
  },
  {
    key: 'positive_flow_tags',
    label: 'Positive flow',
    description: 'What lifted your flow.',
    required: false,
    valueKind: 'string_list',
    group: 'meta',
    aliases: ['Positive Flow', 'Positive flow tags', 'Flow Boosters', 'Boosters', 'Positive'],
    example: 'Good sleep',
  },
  {
    key: 'negative_flow_tags',
    label: 'Negative flow',
    description: 'What drained your flow.',
    required: false,
    valueKind: 'string_list',
    group: 'meta',
    aliases: ['Negative Flow', 'Negative flow tags', 'Flow Drains', 'Drains', 'Negative'],
    example: 'Poor sleep',
  },
  {
    key: 'notes',
    label: 'Notes',
    description: 'Anything worth remembering about the check-in.',
    required: false,
    valueKind: 'string',
    group: 'meta',
    aliases: ['Notes', 'Comments', 'Journal', 'Reflection'],
    example: 'Clear head after a walk.',
  },
];

export interface FlowEntry {
  /** `${kind}:${datasetId}:${recordId}` — re-imports update in place. */
  id: string;
  date: string;
  score: number;
  timeOfDay: string | null;
  positive: string[];
  negative: string[];
  notes: string | null;
  source: { kind: SourceKind; datasetId: string; datasetName: string; recordId: string; recordUrl?: string };
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export interface DayFlow {
  date: string;
  avg: number;
  entries: FlowEntry[];
}

export function dailyFlow(entries: FlowEntry[]): Map<string, DayFlow> {
  const by = new Map<string, FlowEntry[]>();
  for (const e of entries) by.set(e.date, [...(by.get(e.date) ?? []), e]);
  return new Map(
    [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => [date, { date, avg: round(list.reduce((a, e) => a + e.score, 0) / list.length), entries: list }]),
  );
}

export const FLOW_BANDS = [
  { key: 'high', label: 'High flow (8–10)', min: 8 },
  { key: 'medium', label: 'Medium flow (5–7.9)', min: 5 },
  { key: 'low', label: 'Low flow (below 5)', min: -Infinity },
] as const;

export function flowBand(score: number) {
  return FLOW_BANDS.find((b) => score >= b.min)!;
}

export interface FlowBandRow {
  band: (typeof FLOW_BANDS)[number];
  days: number;
  stats: TradeSummary;
}

/** Trades grouped by the trader's average flow on the day they were taken. */
export function tradesByFlowBand(trades: StandardTrade[], days: Map<string, DayFlow>): { rows: FlowBandRow[]; unmatched: number } {
  const groups = new Map<string, StandardTrade[]>();
  const dayCount = new Map<string, Set<string>>();
  let unmatched = 0;
  for (const t of trades) {
    const d = days.get(t.trade_date);
    if (!d) {
      unmatched++;
      continue;
    }
    const b = flowBand(d.avg).key;
    groups.set(b, [...(groups.get(b) ?? []), t]);
    dayCount.set(b, (dayCount.get(b) ?? new Set()).add(t.trade_date));
  }
  return {
    rows: FLOW_BANDS.map((band) => ({ band, days: dayCount.get(band.key)?.size ?? 0, stats: summarise(groups.get(band.key) ?? []) })),
    unmatched,
  };
}

/** Average flow on days that ended green vs red. */
export function flowByDayOutcome(trades: StandardTrade[], days: Map<string, DayFlow>) {
  const net = new Map<string, number>();
  for (const t of trades) net.set(t.trade_date, (net.get(t.trade_date) ?? 0) + t.result_r);
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const green: number[] = [];
  const red: number[] = [];
  for (const [date, r] of net) {
    const d = days.get(date);
    if (!d) continue;
    if (r > 0) green.push(d.avg);
    else if (r < 0) red.push(d.avg);
  }
  return { green: avg(green), red: avg(red), greenDays: green.length, redDays: red.length };
}

/** Pearson correlation between daily average flow and daily net R (null below 5 days). */
export function flowCorrelation(trades: StandardTrade[], days: Map<string, DayFlow>): { r: number; days: number } | null {
  const net = new Map<string, number>();
  for (const t of trades) net.set(t.trade_date, (net.get(t.trade_date) ?? 0) + t.result_r);
  const pts = [...net.entries()].filter(([d]) => days.has(d)).map(([d, r]) => [days.get(d)!.avg, r]);
  if (pts.length < 5) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return { r: round(sxy / Math.sqrt(sxx * syy)), days: pts.length };
}

const SLOT_ORDER = ['morning', 'midday', 'afternoon', 'evening', 'night'];

export function flowByTimeOfDay(entries: FlowEntry[]): { slot: string; avg: number; count: number }[] {
  const by = new Map<string, number[]>();
  for (const e of entries) {
    const k = e.timeOfDay ?? 'Unspecified';
    by.set(k, [...(by.get(k) ?? []), e.score]);
  }
  const rank = (s: string) => {
    const i = SLOT_ORDER.findIndex((o) => s.toLowerCase().includes(o));
    return i === -1 ? 99 : i;
  };
  return [...by.entries()]
    .map(([slot, xs]) => ({ slot, avg: round(xs.reduce((a, b) => a + b, 0) / xs.length), count: xs.length }))
    .sort((a, b) => rank(a.slot) - rank(b.slot) || a.slot.localeCompare(b.slot));
}

/** How often each flow tag appears and the average score when it does. */
export function flowTagImpact(entries: FlowEntry[], key: 'positive' | 'negative'): { tag: string; count: number; avg: number }[] {
  const by = new Map<string, number[]>();
  for (const e of entries) for (const tag of e[key]) by.set(tag, [...(by.get(tag) ?? []), e.score]);
  return [...by.entries()]
    .map(([tag, xs]) => ({ tag, count: xs.length, avg: round(xs.reduce((a, b) => a + b, 0) / xs.length) }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export const isWin = (t: StandardTrade) => outcomeOf(t) === 'win';

// ── Persistence ──────────────────────────────────────────────────────────

export interface FlowRepository {
  upsertMany(entries: FlowEntry[]): Promise<{ inserted: number; updated: number }>;
  list(): Promise<FlowEntry[]>;
  removeDataset(datasetId: string): Promise<number>;
}

const KEY = 'tradelens.flow.v1';

export class LocalStorageFlowRepository implements FlowRepository {
  private entries = new Map<string, FlowEntry>();
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    try {
      const raw = this.storage?.getItem(KEY);
      for (const e of raw ? (JSON.parse(raw) as FlowEntry[]) : []) this.entries.set(e.id, e);
    } catch {
      /* start empty */
    }
  }
  private persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      /* storage unavailable */
    }
  }
  async upsertMany(list: FlowEntry[]) {
    let inserted = 0;
    let updated = 0;
    for (const e of list) {
      if (this.entries.has(e.id)) updated++;
      else inserted++;
      this.entries.set(e.id, e);
    }
    this.persist();
    return { inserted, updated };
  }
  async list() {
    return [...this.entries.values()];
  }
  async removeDataset(datasetId: string) {
    let n = 0;
    for (const [id, e] of this.entries) if (e.source.datasetId === datasetId) (this.entries.delete(id), n++);
    this.persist();
    return n;
  }
}
