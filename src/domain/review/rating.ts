import { MIN_TAG_SAMPLE } from '../analytics/analytics';
import { tagGroups } from '../tags/tags';
import type { StandardTrade } from '../trades/types';

/**
 * Rating gaps: the rating given in the moment vs the rating given again during
 * the weekly review. Big drops show where the in-the-moment judgement was
 * generous — and what those trades have in common.
 */

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const originalRating = (t: StandardTrade) => num(t.optional.execution_rating);
export const reviewRating = (t: StandardTrade) => num(t.optional.review_rating);
const round = (n: number) => Math.round(n * 10) / 10;

export interface RatingGaps {
  /** Trades with both ratings. */
  compared: number;
  /** Trades with a review rating, of trades with an original rating. */
  reviewed: number;
  rated: number;
  avgOriginal: number | null;
  avgReview: number | null;
  /** Rated 2+ points higher in the moment than on review. */
  overrated: StandardTrade[];
  /** Rated 2+ points lower in the moment than on review. */
  underrated: StandardTrade[];
  /** Tags most common on the overrated trades. */
  overratedTags: { group: string; tag: string; count: number }[];
  lowSample: boolean;
}

export function ratingGaps(trades: StandardTrade[]): RatingGaps {
  const rated = trades.filter((t) => originalRating(t) !== null);
  const both = rated.filter((t) => reviewRating(t) !== null);
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const gap = (t: StandardTrade) => originalRating(t)! - reviewRating(t)!;
  const overrated = both.filter((t) => gap(t) >= 2);
  const counts = new Map<string, { group: string; tag: string; count: number }>();
  for (const g of tagGroups(overrated)) {
    for (const t of overrated) {
      for (const tag of new Set(g.values(t))) {
        const k = `${g.label}|${tag}`;
        counts.set(k, { group: g.label, tag, count: (counts.get(k)?.count ?? 0) + 1 });
      }
    }
  }
  return {
    compared: both.length,
    reviewed: both.length,
    rated: rated.length,
    avgOriginal: avg(both.map((t) => originalRating(t)!)),
    avgReview: avg(both.map((t) => reviewRating(t)!)),
    overrated,
    underrated: both.filter((t) => gap(t) <= -2),
    overratedTags: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 3),
    lowSample: both.length < MIN_TAG_SAMPLE,
  };
}

/** Body of POST /api/notion/trade-rating. */
export interface SyncRatingRequest {
  dataSourceId: string;
  pageId: string;
  value: number | null;
}
