import { MIN_TAG_SAMPLE } from '../analytics/analytics';
import { DIMENSIONS, type Dimension } from '../analytics/dimensions';
import { tagGroup } from '../tags/tags';
import { summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import type { FocusGoal, PlanItem } from './daily';

/**
 * Focus areas: a leak from Opportunity gaps (a tag, or a combination such as
 * setup + timeframe) tracked against its own baseline — the 30 days before
 * tracking started — so progress is measured, not guessed.
 */

export const BASELINE_DAYS = 30;
export const MAX_ACTIVE_FOCUS = 3;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

const TAG_KEYS = ['behaviour', 'technical', 'psychology', 'other_tags', 'execution_rating'];
function dimension(key: string): Dimension | null {
  if (TAG_KEYS.includes(key) || key.startsWith('custom:')) return tagGroup(key);
  return DIMENSIONS.find((d) => d.key === key) ?? null;
}

/** `behaviour=Revenge trading&setup=2 Touch` → pairs. Values may contain `=`, keys may not. */
export function parseSource(source: string): { dim: Dimension; value: string }[] {
  return source.split('&').flatMap((part) => {
    const i = part.indexOf('=');
    if (i < 1) return [];
    const dim = dimension(part.slice(0, i));
    return dim ? [{ dim, value: part.slice(i + 1) }] : [];
  });
}

export function sourceLabel(source: string): string {
  return parseSource(source)
    .map((p) => p.value)
    .join(' + ');
}

export const matchesSource = (source: string) => {
  const pairs = parseSource(source);
  return (t: StandardTrade) => pairs.length > 0 && pairs.every((p) => p.dim.values(t).includes(p.value));
};

export type FocusStatus = 'improving' | 'flat' | 'worse' | 'no_data';

export interface FocusProgress {
  item: PlanItem;
  label: string;
  start: string;
  /** Days tracked so far (start → today, inclusive). */
  days: number;
  baseline: TradeSummary;
  current: TradeSummary;
  /** Baseline scaled to the same number of days as the current period. */
  expectedCount: number;
  /** Current net R minus baseline net R over an equal-length period. Positive = better. */
  rSaved: number;
  status: FocusStatus;
  lowSample: boolean;
}

export function focusProgress(item: PlanItem, trades: StandardTrade[], today: string, fallbackStart: string): FocusProgress | null {
  if (!item.source) return null;
  const match = matchesSource(item.source);
  const start = item.start ?? fallbackStart;
  const days = Math.max(1, Math.round((utc(today).getTime() - utc(start).getTime()) / DAY) + 1);
  const baseStart = iso(new Date(utc(start).getTime() - BASELINE_DAYS * DAY));
  const baseEnd = iso(new Date(utc(start).getTime() - DAY));
  const hits = trades.filter(match);
  const baseline = summarise(hits.filter((t) => t.trade_date >= baseStart && t.trade_date <= baseEnd));
  const current = summarise(hits.filter((t) => t.trade_date >= start && t.trade_date <= today));
  const scale = days / BASELINE_DAYS;
  const expectedCount = baseline.count * scale;
  const rSaved = round(current.netR - baseline.netR * scale);
  const goal: FocusGoal = item.goal ?? 'fewer';

  let status: FocusStatus;
  if (goal === 'fewer') {
    const baseRate = baseline.count / BASELINE_DAYS;
    const curRate = current.count / days;
    if (!baseline.count && !current.count) status = 'no_data';
    else if (!baseline.count) status = 'worse';
    else if (curRate <= baseRate * 0.8) status = 'improving';
    else if (curRate >= baseRate * 1.2) status = 'worse';
    else status = 'flat';
  } else {
    if (current.avgR === null || baseline.avgR === null) status = 'no_data';
    else if (current.avgR - baseline.avgR >= 0.2) status = 'improving';
    else if (current.avgR - baseline.avgR <= -0.2) status = 'worse';
    else status = 'flat';
  }
  return { item, label: sourceLabel(item.source), start, days, baseline, current, expectedCount: round(expectedCount, 1), rSaved, status, lowSample: baseline.count + current.count < MIN_TAG_SAMPLE };
}

/** Active focus areas across every period: items with a source that are still open. */
export function activeFocusAreas(entries: { key: string; item: PlanItem }[]): { key: string; item: PlanItem }[] {
  return entries.filter((e) => e.item.source && e.item.status === 'open');
}
