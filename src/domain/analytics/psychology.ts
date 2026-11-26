import { isMissed } from '../trades/status';
import { outcomeOf, summarise } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import { MIN_TAG_SAMPLE } from './analytics';

const tagsOf = (t: StandardTrade, key = 'psychology_tags'): string[] => {
  const v = t.optional[key];
  return Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\s*,\s*/) : [];
};

export interface PsychologyRow {
  tag: string;
  /** Taken trades carrying the tag. */
  taken: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Missed trades carrying the tag. */
  missed: number;
  winRate: number | null;
  avgR: number | null;
  netR: number;
  /** Share of all tagged occurrences (taken + missed) that were missed. */
  missedShare: number;
  lowSample: boolean;
}

/**
 * Wins, losses and missed trades per psychology tag. Missed trades are counted
 * separately so "Fear of losing" shows up where it matters — on trades not taken.
 */
export function psychologyBreakdown(trades: StandardTrade[], key = 'psychology_tags'): PsychologyRow[] {
  const tags = new Set(trades.flatMap((t) => tagsOf(t, key)));
  const rows: PsychologyRow[] = [];
  for (const tag of tags) {
    const all = trades.filter((t) => tagsOf(t, key).includes(tag));
    const taken = all.filter((t) => !isMissed(t));
    const missed = all.length - taken.length;
    const s = summarise(taken);
    rows.push({
      tag,
      taken: taken.length,
      wins: s.wins,
      losses: s.losses,
      breakeven: s.breakeven,
      missed,
      winRate: s.winRate,
      avgR: s.avgR,
      netR: s.netR,
      missedShare: all.length ? missed / all.length : 0,
      lowSample: all.length < MIN_TAG_SAMPLE,
    });
  }
  return rows.sort((a, b) => b.taken + b.missed - (a.taken + a.missed) || a.tag.localeCompare(b.tag));
}

export interface RatingRow {
  rating: number;
  count: number;
  winRate: number | null;
  avgR: number | null;
}

/** Outcome by execution rating (rounded to the nearest whole point). */
export function ratingBreakdown(trades: StandardTrade[]): RatingRow[] {
  const groups = new Map<number, StandardTrade[]>();
  for (const t of trades) {
    const r = t.optional.execution_rating;
    if (typeof r !== 'number') continue;
    const k = Math.round(r);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rating, list]) => {
      const s = summarise(list);
      return { rating, count: list.length, winRate: s.winRate, avgR: s.avgR };
    });
}

/** Average execution rating on winning vs losing trades. */
export function ratingByOutcome(trades: StandardTrade[]): { wins: number | null; losses: number | null } {
  const avg = (o: 'win' | 'loss') => {
    const xs = trades.filter((t) => outcomeOf(t) === o).map((t) => t.optional.execution_rating).filter((v): v is number => typeof v === 'number');
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  };
  return { wins: avg('win'), losses: avg('loss') };
}

export { tagsOf as psychologyTagsOf };
