import { breakdown, performance, type PerformanceStats } from '../analytics/analytics';
import { getDimension } from '../analytics/dimensions';
import { psychologyTagsOf } from '../analytics/psychology';
import type { PeriodRange, ReviewPeriod } from '../analytics/review';
import { dailyFlow, flowByDayOutcome, flowTagImpact, type FlowEntry } from '../flow/flow';
import type { StandardTrade } from '../trades/types';
import { dayRows, discipline, opportunityGaps, patterns, repeatableTags, subPanels, tradeQuality, type DayRow, type Panel } from './centre';
import type { DailyReview, PlanItem } from './daily';

/**
 * Advanced Self Review (ASR): a provider-neutral document describing one review
 * period. The Notion backend turns it into a page; other targets (Markdown,
 * PDF) could render the same structure.
 */

export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: 'green' | 'red' | 'gray';
  link?: string;
}
export type Rich = RichSpan[];

export type AsrBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; rich: Rich }
  | { type: 'bullets'; items: Rich[] }
  | { type: 'callout'; emoji: string; rich: Rich }
  | { type: 'table'; header: string[]; rows: Rich[][] }
  /** `image` refers to AsrImage.key; skipped when that image wasn't supplied. */
  | { type: 'image'; image: string; caption: string }
  | { type: 'divider' }
  | { type: 'todo'; text: string; checked?: boolean };

export interface AsrProperties {
  period: 'Weekly' | 'Monthly' | 'Quarterly';
  start: string;
  end: string;
  netR: number;
  /** Fraction 0–1. */
  winRate: number | null;
  trades: number;
  netPl: number;
}

export interface AsrDocument {
  title: string;
  icon: string;
  properties: AsrProperties;
  blocks: AsrBlock[];
}

/** What the browser sends to a backend that publishes the review (e.g. POST /api/notion/reviews). */
export interface AsrImagePayload {
  key: string;
  filename: string;
  /** PNG bytes, base64-encoded. */
  base64: string;
}
export interface CreateAsrRequest {
  dataSourceId: string;
  document: AsrDocument;
  images: AsrImagePayload[];
}

/** Charts the review page can attach, in the order they appear. */
export const ASR_IMAGES = [
  { key: 'equity', label: 'Equity curve' },
  { key: 'missed', label: 'Real vs missed equity' },
] as const;
export type AsrImageKey = (typeof ASR_IMAGES)[number]['key'];

export interface AsrInput {
  period: ReviewPeriod;
  range: PeriodRange;
  /** Taken trades in the period. */
  taken: StandardTrade[];
  /** Taken trades in the previous period, for comparison. */
  prevTaken: StandardTrade[];
  missed: StandardTrade[];
  flow?: FlowEntry[];
  /** Images that will be attached (keys of ASR_IMAGES). */
  images?: string[];
  /** Daily ASR entries (any dates; filtered to the range). */
  daily?: DailyReview[];
  /** Commitments / focus areas / objectives for this period, and any already set for the next. */
  plan?: PlanItem[];
  nextPlan?: PlanItem[];
  /** For "today" in elapsed-day calculations (tests). */
  today?: string;
}

const PERIOD_NAME: Record<ReviewPeriod, AsrProperties['period']> = { week: 'Weekly', month: 'Monthly', quarter: 'Quarterly' };
const NOUN: Record<ReviewPeriod, string> = { week: 'week', month: 'month', quarter: 'quarter' };

const MINUS = '−';
const fixed = (n: number, dp = 2) => n.toFixed(dp).replace('-', MINUS);
const signed = (n: number, unit: string, dp = 2) => `${n > 0 ? '+' : ''}${fixed(n, dp)}${unit}`;
const r = (n: number | null) => (n === null ? '—' : signed(n, 'R'));
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const tone = (n: number | null | undefined): RichSpan['color'] => (n === null || n === undefined || n === 0 ? undefined : n > 0 ? 'green' : 'red');
const span = (text: string, extra: Omit<RichSpan, 'text'> = {}): RichSpan => ({ text, ...extra });
const plain = (text: string): Rich => [span(text)];
const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

function countTags(trades: StandardTrade[], get: (t: StandardTrade) => string[], limit = 5): [string, number][] {
  const m = new Map<string, number>();
  for (const t of trades) for (const tag of get(t)) m.set(tag, (m.get(tag) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}
const listOf = (key: string) => (t: StandardTrade) => {
  const v = t.optional[key];
  return Array.isArray(v) ? (v as string[]) : [];
};

function tradeLine(t: StandardTrade): Rich {
  const detail = [t.setup, typeof t.optional.timeframe === 'string' ? t.optional.timeframe : null, fmtDay(t.trade_date)].filter(Boolean).join(' · ');
  return [
    span(t.currency_pair, { bold: true, link: t.source.recordUrl }),
    span(` · ${detail} · `),
    span(r(t.result_r), { bold: true, color: tone(t.result_r) }),
  ];
}

function scoreRow(label: string, now: string, prev: string, delta?: { value: number | null; unit: string; dp?: number; invert?: boolean }): Rich[] {
  const d = delta?.value;
  const good = d === null || d === undefined || d === 0 ? undefined : (delta!.invert ? d < 0 : d > 0) ? 'green' : 'red';
  const deltaText = d === null || d === undefined ? '—' : signed(d, delta!.unit, delta!.dp ?? 2);
  return [plain(label), [span(now, { bold: true })], plain(prev), [span(deltaText, { color: good })]];
}

function headline(p: PerformanceStats, noun: string): Rich {
  const parts: Rich = [
    span(`${p.count} trade${p.count === 1 ? '' : 's'} · `),
    span(r(p.netR), { bold: true, color: tone(p.netR) }),
    span(` · ${pct(p.winRate)} win rate · ${signed(p.netPl, '%')} P/L`),
  ];
  if (p.count === 0) return plain(`No trades taken this ${noun}.`);
  return parts;
}

export const PLAN_LABEL: Record<ReviewPeriod, string> = { week: 'Commitments', month: 'Focus areas', quarter: 'Strategic objectives' };

const REFLECTION: Record<ReviewPeriod, string[]> = {
  week: [
    'Did my daily performance carry into the week’s result?',
    'Which commitments did I keep — and what got in the way of the others?',
    'Best decision of the week, and the mistake that cost the most',
    'What is my one focus for next week?',
  ],
  month: [
    'Which tags keep repeating — and what do they earn or cost me?',
    'Where is my biggest opportunity gap, and what closes it?',
    'Am I improving week to week? What changed?',
    'What is my focus for next month?',
  ],
  quarter: [
    'What patterns define my edge this quarter?',
    'Which strategic objectives did I hit, and which slipped?',
    'What should I stop, start and keep doing?',
    'What are my objectives for next quarter?',
  ],
};

const score = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}`);
const dayFmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

function panelTable(first: string, panels: Panel[]): AsrBlock {
  return {
    type: 'table',
    header: [first, 'Net R', 'Win rate', 'Trades', 'Performance', 'Flow', 'Top win', 'Top mistake'],
    rows: panels.map((p) => [
      [span(p.label, { bold: true }), span(` ${p.range.start.slice(5)}–${p.range.end.slice(5)}`, { color: 'gray' })],
      [span(r(p.perf.count ? p.perf.netR : null), { color: tone(p.perf.netR) })],
      plain(pct(p.perf.winRate)),
      plain(String(p.perf.count)),
      plain(score(p.avgPerformance)),
      plain(score(p.avgFlow)),
      plain(p.topWin ?? '—'),
      plain(p.topMistake ?? '—'),
    ]),
  };
}

function planBlocks(period: ReviewPeriod, items: PlanItem[] | undefined): AsrBlock[] {
  const list = (items ?? []).filter((i) => i.text.trim());
  if (!list.length) return [];
  const kept = list.filter((i) => i.status === 'kept').length;
  return [
    { type: 'heading', level: 2, text: `${PLAN_LABEL[period]} this ${NOUN[period]}` },
    { type: 'paragraph', rich: [span(`${kept} of ${list.length} kept`, { bold: true })] },
    ...list.map((i): AsrBlock => ({ type: 'todo', text: i.status === 'missed' ? `${i.text} (missed)` : i.text, checked: i.status === 'kept' })),
  ];
}

function disciplineBlocks(rows: DayRow[], taken: StandardTrade[], today?: string): AsrBlock[] {
  const d = discipline(rows, today);
  const q = tradeQuality(taken);
  const items: Rich[] = [[span('Daily ASRs logged: '), span(`${d.logged} of ${d.days} days`, { bold: true })]];
  if (d.cleanRate !== null) items.push([span('Days without a mistake: '), span(pct(d.cleanRate), { bold: true })]);
  if (d.avgPerformance !== null) items.push([span('Average performance score: '), span(`${score(d.avgPerformance)} / 10`, { bold: true })]);
  if (d.performanceOnGreen !== null || d.performanceOnRed !== null)
    items.push([
      span('Performance score on green days '),
      span(score(d.performanceOnGreen), { bold: true, color: 'green' }),
      span(' vs red days '),
      span(score(d.performanceOnRed), { bold: true, color: 'red' }),
    ]);
  items.push([span('Good trades: '), span(`${q.good.count} · ${r(q.good.netR)}`, { bold: true, color: tone(q.good.netR) })]);
  items.push([span('Trades with mistakes: '), span(`${q.mistakes.count} · ${r(q.mistakes.netR)}`, { bold: true, color: tone(q.mistakes.netR) })]);
  return [{ type: 'heading', level: 2, text: 'Discipline' }, { type: 'bullets', items }];
}

function repeatableBlocks(taken: StandardTrade[], rows: DayRow[]): AsrBlock[] {
  const tags = repeatableTags(taken, rows).slice(0, 12);
  if (!tags.length) return [];
  return [
    { type: 'heading', level: 2, text: 'Repeatable tags' },
    {
      type: 'table',
      header: ['Tag', 'Type', 'Count', 'Avg R', 'Net R'],
      rows: tags.map((t) => [
        [span(t.tag, { bold: true })],
        plain(t.kind),
        plain(String(t.count)),
        [span(r(t.avgR), { color: tone(t.avgR) })],
        [span(r(t.netR), { color: tone(t.netR) })],
      ]),
    },
  ];
}

function periodSections(input: AsrInput): AsrBlock[] {
  const { period, range, taken, missed } = input;
  const rows = dayRows(range, taken, input.daily ?? [], input.flow ?? []);
  const blocks: AsrBlock[] = [];

  if (period === 'week') {
    blocks.push({ type: 'heading', level: 2, text: 'Daily summaries' });
    blocks.push({
      type: 'table',
      header: ['Day', 'Net R', 'Trades', 'Performance', 'Flow', 'Wins', 'Mistakes'],
      rows: rows.map((d) => [
        [span(dayFmtShort.format(new Date(`${d.date}T00:00:00Z`)), { bold: true })],
        [span(d.trades.length ? r(d.stats.netR) : '—', { color: tone(d.stats.netR) })],
        plain(String(d.trades.length)),
        plain(score(d.performanceScore)),
        plain(score(d.flowScore)),
        plain(d.review?.wins.join(', ') || '—'),
        plain(d.review?.mistakes.join(', ') || '—'),
      ]),
    });
    const lessons = rows.filter((d) => d.review?.lesson);
    if (lessons.length) {
      blocks.push({ type: 'heading', level: 3, text: 'Lessons from the week' });
      blocks.push({ type: 'bullets', items: lessons.map((d) => [span(`${dayFmtShort.format(new Date(`${d.date}T00:00:00Z`))}: `, { bold: true }), span(d.review!.lesson!)]) });
    }
    blocks.push(...disciplineBlocks(rows, taken, input.today));
    blocks.push(...planBlocks(period, input.plan));
  }

  if (period === 'month' || period === 'quarter') {
    const panels = subPanels(period, range, taken, input.daily ?? [], input.flow ?? [], input.today);
    blocks.push({ type: 'heading', level: 2, text: period === 'month' ? 'Weeks' : 'Months' });
    blocks.push(panelTable(period === 'month' ? 'Week' : 'Month', panels));
    blocks.push(...disciplineBlocks(rows, taken, input.today));
  }

  if (period === 'month') {
    blocks.push(...repeatableBlocks(taken, rows));
    const g = opportunityGaps(taken, missed, rows, input.today);
    const items: Rich[] = [];
    if (g.missedWinners) items.push([span('Missed winners: '), span(`${g.missedWinners} trades · ${r(g.missedWinnersR)}`, { bold: true, color: 'green' }), span(' left on the table')]);
    if (g.mistakeTrades) items.push([span('Trades with mistakes: '), span(`${g.mistakeTrades} · ${r(g.mistakeTradesR)}`, { bold: true, color: tone(g.mistakeTradesR) })]);
    if (g.costliestMistake) items.push([span('Costliest habit: '), span(g.costliestMistake.tag, { bold: true }), span(` · ${r(g.costliestMistake.netR)} over ${g.costliestMistake.count}`)]);
    for (const leak of g.leaks)
      items.push([span('Leak: '), span(leak.factors.map((f) => f.value).join(' + '), { bold: true }), span(` · ${leak.stats.count} trades · ${r(leak.stats.avgR)} avg`, { color: 'red' })]);
    if (g.unloggedDays) items.push([span(`${g.unloggedDays} trading day${g.unloggedDays === 1 ? '' : 's'} without a Daily ASR`, { color: 'gray' })]);
    if (items.length) blocks.push({ type: 'heading', level: 2, text: 'Opportunity gaps' }, { type: 'bullets', items });
    blocks.push(...planBlocks(period, input.plan));
  }

  if (period === 'quarter') {
    const p = patterns(taken);
    if (p.edge.length || p.needsWork.length) {
      blocks.push({ type: 'heading', level: 2, text: 'Patterns' });
      const seg = (x: (typeof p.edge)[number]): Rich => [
        span(x.factors.map((f) => f.value).join(' + '), { bold: true }),
        span(` · ${x.stats.count} trades · `),
        span(`${r(x.stats.avgR)} avg`, { color: tone(x.stats.avgR) }),
      ];
      if (p.edge.length) blocks.push({ type: 'heading', level: 3, text: 'Where your edge is' }, { type: 'bullets', items: p.edge.map(seg) });
      if (p.needsWork.length) blocks.push({ type: 'heading', level: 3, text: 'Needs work' }, { type: 'bullets', items: p.needsWork.map(seg) });
    }
    blocks.push(...repeatableBlocks(taken, rows));
    blocks.push(...planBlocks(period, input.plan));
  }
  return blocks;
}

export function buildAsr(input: AsrInput): AsrDocument {
  const { period, range, taken, prevTaken, missed } = input;
  const noun = NOUN[period];
  const perf = performance(taken);
  const prev = performance(prevTaken);
  const hasPrev = prevTaken.length > 0;
  const images = new Set(input.images ?? []);
  const blocks: AsrBlock[] = [];

  blocks.push({ type: 'callout', emoji: perf.netR > 0 ? '📈' : perf.netR < 0 ? '📉' : '📊', rich: headline(perf, noun) });

  // Scorecard
  blocks.push({ type: 'heading', level: 2, text: 'Scorecard' });
  const prevOr = (s: string) => (hasPrev ? s : '—');
  const winDelta = hasPrev && perf.winRate !== null && prev.winRate !== null ? Math.round((perf.winRate - prev.winRate) * 100) : null;
  blocks.push({
    type: 'table',
    header: ['Metric', `This ${noun}`, `Last ${noun}`, 'Change'],
    rows: [
      scoreRow('Net R', r(perf.netR), prevOr(r(prev.netR)), { value: hasPrev ? perf.netR - prev.netR : null, unit: 'R' }),
      scoreRow('Net P/L', signed(perf.netPl, '%'), prevOr(signed(prev.netPl, '%')), { value: hasPrev ? perf.netPl - prev.netPl : null, unit: '%' }),
      scoreRow('Win rate', pct(perf.winRate), prevOr(pct(prev.winRate)), { value: winDelta, unit: ' pts', dp: 0 }),
      scoreRow('Trades', String(perf.count), prevOr(String(prev.count)), { value: hasPrev ? perf.count - prev.count : null, unit: '', dp: 0 }),
      scoreRow('Expectancy', r(perf.avgR), prevOr(r(prev.avgR))),
      scoreRow('Profit factor', perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2), prevOr(prev.profitFactor === null ? '—' : prev.profitFactor.toFixed(2))),
      scoreRow('Max drawdown', perf.maxDrawdownR ? `${MINUS}${perf.maxDrawdownR.toFixed(2)}R` : '0R', prevOr(prev.maxDrawdownR ? `${MINUS}${prev.maxDrawdownR.toFixed(2)}R` : '0R')),
      scoreRow('Streaks', `${perf.longestWinStreak}W / ${perf.longestLossStreak}L`, prevOr(`${prev.longestWinStreak}W / ${prev.longestLossStreak}L`)),
    ],
  });

  blocks.push(...periodSections(input));

  // Charts
  if (images.has('equity') || images.has('missed')) {
    blocks.push({ type: 'heading', level: 2, text: 'Equity' });
    if (images.has('equity')) blocks.push({ type: 'image', image: 'equity', caption: `Cumulative R · ${range.label}` });
    if (images.has('missed')) blocks.push({ type: 'image', image: 'missed', caption: `Real equity vs equity including missed trades · ${range.label}` });
  }

  // Setups
  const setups = breakdown(taken, getDimension('setup')).sort((a, b) => b.stats.netR - a.stats.netR);
  if (setups.length) {
    blocks.push({ type: 'heading', level: 2, text: 'Setups' });
    blocks.push({
      type: 'table',
      header: ['Setup', 'Trades', 'Win rate', 'Avg R', 'Net R'],
      rows: setups.map((s) => [
        [span(s.value, { bold: true })],
        plain(String(s.stats.count)),
        plain(pct(s.stats.winRate)),
        [span(r(s.stats.avgR), { color: tone(s.stats.avgR) })],
        [span(r(s.stats.netR), { color: tone(s.stats.netR) })],
      ]),
    });
  }

  // Best / worst
  const sorted = [...taken].sort((a, b) => b.result_r - a.result_r);
  const best = sorted.filter((t) => t.result_r > 0).slice(0, 3);
  const worst = [...sorted].reverse().filter((t) => t.result_r < 0).slice(0, 3);
  if (best.length || worst.length) {
    blocks.push({ type: 'heading', level: 2, text: 'Best & worst trades' });
    if (best.length) {
      blocks.push({ type: 'heading', level: 3, text: 'Best' });
      blocks.push({ type: 'bullets', items: best.map(tradeLine) });
    }
    if (worst.length) {
      blocks.push({ type: 'heading', level: 3, text: 'Worst' });
      blocks.push({ type: 'bullets', items: worst.map(tradeLine) });
    }
  }

  // Behaviour
  const tagSections: [string, [string, number][]][] = [
    ['What went well', countTags(taken, listOf('positive_tags'))],
    ['What to work on', countTags(taken, listOf('negative_tags'))],
    ['Psychology', countTags([...taken, ...missed], psychologyTagsOf)],
  ];
  if (tagSections.some(([, items]) => items.length)) {
    blocks.push({ type: 'heading', level: 2, text: 'Behaviour' });
    for (const [title, items] of tagSections) {
      if (!items.length) continue;
      blocks.push({ type: 'heading', level: 3, text: title });
      blocks.push({ type: 'bullets', items: items.map(([tag, n]) => [span(tag, { bold: true }), span(` · ${n} trade${n === 1 ? '' : 's'}`, { color: 'gray' })]) });
    }
  }

  // Flow
  const flow = (input.flow ?? []).filter((e) => e.date >= range.start && e.date <= range.end);
  if (flow.length) {
    const days = dailyFlow(flow);
    const avg = flow.reduce((a, e) => a + e.score, 0) / flow.length;
    const outcome = flowByDayOutcome(taken, days);
    const lifts = flowTagImpact(flow, 'positive').slice(0, 3);
    const drains = flowTagImpact(flow, 'negative').slice(0, 3);
    blocks.push({ type: 'heading', level: 2, text: 'Flow Zone' });
    const items: Rich[] = [[span('Average flow: '), span(`${avg.toFixed(1)} / 10`, { bold: true }), span(` across ${flow.length} check-ins on ${days.size} days`)]];
    if (outcome.green !== null) items.push([span('Flow on green days: '), span(outcome.green.toFixed(1), { bold: true, color: 'green' })]);
    if (outcome.red !== null) items.push([span('Flow on red days: '), span(outcome.red.toFixed(1), { bold: true, color: 'red' })]);
    if (lifts.length) items.push([span('Lifted by: '), span(lifts.map((l) => l.tag).join(', '), { bold: true })]);
    if (drains.length) items.push([span('Drained by: '), span(drains.map((l) => l.tag).join(', '), { bold: true })]);
    blocks.push({ type: 'bullets', items });
  }

  // Missed
  if (missed.length) {
    const left = missed.filter((t) => t.result_r > 0).reduce((a, t) => a + t.result_r, 0);
    blocks.push({ type: 'heading', level: 2, text: 'Missed trades' });
    blocks.push({
      type: 'paragraph',
      rich: [span(`${missed.length} missed trade${missed.length === 1 ? '' : 's'} — `), span(r(left), { bold: true, color: left > 0 ? 'green' : undefined }), span(' left on the table from would-be winners.')],
    });
    blocks.push({
      type: 'bullets',
      items: missed.slice(0, 10).map((t) => {
        const line = tradeLine(t);
        const reason = typeof t.optional.missed_reason === 'string' ? t.optional.missed_reason : null;
        return reason ? [...line, span(` · ${reason}`, { color: 'gray' })] : line;
      }),
    });
  }

  // Reflection prompts
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'heading', level: 2, text: 'Reflection' });
  for (const q of REFLECTION[period]) {
    blocks.push({ type: 'heading', level: 3, text: q });
    blocks.push({ type: 'paragraph', rich: [] });
  }
  blocks.push({ type: 'heading', level: 3, text: `${PLAN_LABEL[period]} for next ${noun}` });
  const next = (input.nextPlan ?? []).filter((i) => i.text.trim());
  if (next.length) for (const i of next) blocks.push({ type: 'todo', text: i.text });
  else blocks.push({ type: 'todo', text: '' });

  return {
    title: `${PERIOD_NAME[period]} review · ${range.label}`,
    icon: '🧭',
    properties: {
      period: PERIOD_NAME[period],
      start: range.start,
      end: range.end,
      netR: Math.round(perf.netR * 100) / 100,
      winRate: perf.winRate === null ? null : Math.round(perf.winRate * 1000) / 1000,
      trades: perf.count,
      netPl: Math.round(perf.netPl * 100) / 100,
    },
    blocks,
  };
}
