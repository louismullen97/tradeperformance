import { performance, type PerformanceStats } from '../analytics/analytics';
import { edgeAnalysis, type Segment } from '../analytics/edge';
import { periodRange, shiftPeriod, type PeriodRange } from '../analytics/review';
import { badTagsOf, behaviourTone, goodTagsOf, tagGroups } from '../tags/tags';
import { dailyFlow, type FlowEntry } from '../flow/flow';
import { summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import type { DailyReview } from './daily';

/** Review Centre analytics: daily rows, sub-period panels, discipline, repeatable tags and gaps. */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inRange = (date: string, r: { start: string; end: string }) => date >= r.start && date <= r.end;

export interface DayRow {
  date: string;
  trades: StandardTrade[];
  stats: TradeSummary;
  review: DailyReview | null;
  performanceScore: number | null;
  /** Daily ASR flow score, else the average of that day's Flow Log check-ins. */
  flowScore: number | null;
}

/** Weekdays in the range, plus any weekend day that has trades or a review. */
export function dayRows(range: { start: string; end: string }, trades: StandardTrade[], reviews: DailyReview[], flow: FlowEntry[] = []): DayRow[] {
  const byDate = new Map<string, StandardTrade[]>();
  for (const t of trades) if (inRange(t.trade_date, range)) byDate.set(t.trade_date, [...(byDate.get(t.trade_date) ?? []), t]);
  const reviewBy = new Map(reviews.filter((r) => inRange(r.date, range)).map((r) => [r.date, r]));
  const flowBy = dailyFlow(flow.filter((e) => inRange(e.date, range)));
  const rows: DayRow[] = [];
  for (let d = utc(range.start); iso(d) <= range.end; d = new Date(d.getTime() + DAY)) {
    const date = iso(d);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const review = reviewBy.get(date) ?? null;
    const list = byDate.get(date) ?? [];
    if (weekend && !list.length && !review) continue;
    rows.push({
      date,
      trades: list,
      stats: summarise(list),
      review,
      performanceScore: review?.performanceScore ?? null,
      flowScore: review?.flowScore ?? flowBy.get(date)?.avg ?? null,
    });
  }
  return rows;
}

export interface Discipline {
  /** Days with a Daily ASR. */
  logged: number;
  /** Trading days in the range (weekdays up to today, plus traded weekend days). */
  days: number;
  /** Share of logged days with no mistakes, 0–1. */
  cleanRate: number | null;
  avgPerformance: number | null;
  avgFlow: number | null;
  /** Average performance score on green vs red days. */
  performanceOnGreen: number | null;
  performanceOnRed: number | null;
  winsCount: number;
  mistakesCount: number;
}

export function discipline(rows: DayRow[], today = iso(new Date())): Discipline {
  const elapsed = rows.filter((r) => r.date <= today);
  const logged = elapsed.filter((r) => r.review);
  const scored = elapsed.filter((r) => r.performanceScore !== null);
  const flows = elapsed.map((r) => r.flowScore).filter((v): v is number => v !== null);
  const on = (pred: (r: DayRow) => boolean) => mean(scored.filter(pred).map((r) => r.performanceScore!));
  const avg = (v: number | null) => (v === null ? null : round(v));
  return {
    logged: logged.length,
    days: elapsed.length,
    cleanRate: logged.length ? logged.filter((r) => r.review!.mistakes.length === 0).length / logged.length : null,
    avgPerformance: avg(mean(scored.map((r) => r.performanceScore!))),
    avgFlow: avg(mean(flows)),
    performanceOnGreen: avg(on((r) => r.stats.netR > 0)),
    performanceOnRed: avg(on((r) => r.stats.netR < 0)),
    winsCount: logged.reduce((a, r) => a + r.review!.wins.length, 0),
    mistakesCount: logged.reduce((a, r) => a + r.review!.mistakes.length, 0),
  };
}

export interface TradeQuality {
  good: { count: number; netR: number };
  mistakes: { count: number; netR: number };
  untagged: { count: number; netR: number };
}

/** Trades with only good behaviour ("good trades") vs trades carrying a mistake ("mistakes"). */
export function tradeQuality(trades: StandardTrade[]): TradeQuality {
  const out: TradeQuality = { good: { count: 0, netR: 0 }, mistakes: { count: 0, netR: 0 }, untagged: { count: 0, netR: 0 } };
  for (const t of trades) {
    const bucket = badTagsOf(t).length ? out.mistakes : goodTagsOf(t).length ? out.good : out.untagged;
    bucket.count++;
    bucket.netR += t.result_r;
  }
  for (const b of Object.values(out)) b.netR = round(b.netR, 2);
  return out;
}

export interface Panel {
  label: string;
  range: PeriodRange;
  perf: PerformanceStats;
  avgPerformance: number | null;
  avgFlow: number | null;
  topWin: string | null;
  topMistake: string | null;
}

function top(items: string[]): string | null {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Weeks of a month (full Mon–Sun weeks whose Thursday falls in the month) or months of a quarter. */
export function subPanels(
  period: 'month' | 'quarter',
  range: PeriodRange,
  trades: StandardTrade[],
  reviews: DailyReview[],
  flow: FlowEntry[] = [],
  today = iso(new Date()),
): Panel[] {
  const ranges: PeriodRange[] = [];
  if (period === 'month') {
    // Full Mon–Sun weeks that belong to the month: the week's Thursday is in it (ISO convention).
    let w = periodRange('week', range.start);
    let i = 1;
    for (;;) {
      const thursday = iso(new Date(utc(w.start).getTime() + 3 * DAY));
      if (thursday > range.end) break;
      if (thursday >= range.start) ranges.push({ start: w.start, end: w.end, label: `Week ${i++}` });
      w = periodRange('week', shiftPeriod('week', w.start, 1));
    }
  } else {
    for (let i = 0; i < 3; i++) ranges.push(periodRange('month', shiftPeriod('month', range.start, i)));
  }
  return ranges.map((r) => {
    const rows = dayRows(r, trades, reviews, flow);
    const d = discipline(rows, today);
    const taken = trades.filter((t) => inRange(t.trade_date, r));
    const logged = rows.flatMap((x) => (x.review ? [x.review] : []));
    return {
      label: r.label,
      range: r,
      perf: performance(taken),
      avgPerformance: d.avgPerformance,
      avgFlow: d.avgFlow,
      topWin: top([...logged.flatMap((x) => x.wins), ...taken.flatMap(goodTagsOf)]),
      topMistake: top([...logged.flatMap((x) => x.mistakes), ...taken.flatMap(badTagsOf)]),
    };
  });
}

/** Where the tag comes from, e.g. "Behaviour", "Technical", a custom column name, or "Day · win". */
export type TagKind = string;
export interface RepeatableTag {
  tag: string;
  kind: TagKind;
  /** Trades (trade tags) or days (day tags) carrying the tag. */
  count: number;
  /** Net R of those trades, or of those days. */
  netR: number;
  avgR: number;
  tone: 'positive' | 'negative' | 'neutral';
  /** Trade tags only: the tag group's key, so the tag can become a focus area. */
  groupKey?: string;
}

/** Tags that keep showing up (≥ minCount) and the R attached to them. */
export function repeatableTags(trades: StandardTrade[], rows: DayRow[], minCount = 3): RepeatableTag[] {
  const out: RepeatableTag[] = [];
  const add = (kind: TagKind, tone: RepeatableTag['tone'] | ((tag: string) => RepeatableTag['tone']), groups: Map<string, number[]>, groupKey?: string) => {
    for (const [tag, rs] of groups) {
      if (rs.length < minCount) continue;
      const net = rs.reduce((a, b) => a + b, 0);
      out.push({ tag, kind, count: rs.length, netR: round(net, 2), avgR: round(net / rs.length, 2), tone: typeof tone === 'function' ? tone(tag) : tone, ...(groupKey ? { groupKey } : {}) });
    }
  };
  const byTrade = (get: (t: StandardTrade) => string[]) => {
    const m = new Map<string, number[]>();
    for (const t of trades) for (const tag of new Set(get(t))) m.set(tag, [...(m.get(tag) ?? []), t.result_r]);
    return m;
  };
  const byDay = (get: (r: DailyReview) => string[]) => {
    const m = new Map<string, number[]>();
    for (const row of rows) if (row.review) for (const tag of new Set(get(row.review))) m.set(tag, [...(m.get(tag) ?? []), row.stats.netR]);
    return m;
  };
  const toneOfBehaviour = (tag: string): RepeatableTag['tone'] => ({ good: 'positive', bad: 'negative', neutral: 'neutral' } as const)[behaviourTone(tag)];
  for (const g of tagGroups(trades)) add(g.label, g.kind === 'behaviour' ? toneOfBehaviour : 'neutral', byTrade(g.values), g.key);
  add('Day · win', 'positive', byDay((r) => r.wins));
  add('Day · mistake', 'negative', byDay((r) => r.mistakes));
  add('Day · emotion', 'neutral', byDay((r) => r.emotions));
  return out.sort((a, b) => b.count - a.count || b.netR - a.netR);
}

export interface OpportunityGaps {
  /** R the missed would-be winners would have added. */
  missedWinnersR: number;
  missedWinners: number;
  /** Net R of trades tagged with a mistake (usually negative). */
  mistakeTradesR: number;
  mistakeTrades: number;
  /** Most costly negative tag by net R. */
  costliestMistake: RepeatableTag | null;
  /** Losing segments with enough trades in the period. */
  leaks: Segment[];
  /** Trading days without a Daily ASR. */
  unloggedDays: number;
}

export function opportunityGaps(trades: StandardTrade[], missed: StandardTrade[], rows: DayRow[], today = iso(new Date())): OpportunityGaps {
  const winners = missed.filter((t) => t.result_r > 0);
  const q = tradeQuality(trades);
  const negatives = repeatableTags(trades, rows, 2).filter((t) => t.tone === 'negative' && t.netR < 0);
  return {
    missedWinnersR: round(winners.reduce((a, t) => a + t.result_r, 0), 2),
    missedWinners: winners.length,
    mistakeTradesR: q.mistakes.netR,
    mistakeTrades: q.mistakes.count,
    costliestMistake: negatives.sort((a, b) => a.netR - b.netR)[0] ?? null,
    leaks: edgeAnalysis(trades, { minSample: 3, limit: 3 }).needsWork,
    unloggedDays: rows.filter((r) => r.date <= today && !r.review).length,
  };
}

/** Edge & needs-work patterns for a quarter (more evidence → stricter threshold). */
export function patterns(trades: StandardTrade[]) {
  const report = edgeAnalysis(trades, { minSample: 5, limit: 3 });
  return { edge: report.edge, needsWork: report.needsWork, profile: report.profile };
}
