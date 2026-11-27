import { dailyFlow, flowBand, type FlowEntry } from '../flow/flow';
import { tagGroups } from '../tags/tags';
import { outcomeOf, summarise, type TradeSummary } from '../trades/summary';
import type { StandardTrade } from '../trades/types';
import { MIN_TAG_SAMPLE } from './analytics';
import { DIMENSIONS, type Dimension } from './dimensions';

/**
 * Insights: what your losing (or winning) trades have in common, compared with
 * all your trades. Purely descriptive — "on your data", never causal.
 */

export interface Insight {
  /** e.g. "Flow", "Behaviour", "Session". */
  factor: string;
  value: string;
  /** How the value reads in a sentence, e.g. "on low-flow days". */
  phrase: string;
  /** Losing (or winning) trades with this value. */
  hits: number;
  /** All losing (or winning) trades. */
  of: number;
  /** Share of all trades that have this value (the baseline). */
  baseline: number;
  /** hits / of. */
  share: number;
  /** All trades with the value. */
  stats: TradeSummary;
  lowSample: boolean;
  score: number;
}

interface Factor {
  label: string;
  values: (t: StandardTrade) => string[];
  phrase: (v: string) => string;
}

const RATING_BAND = (r: number) => (r >= 4 ? 'Rated 4–5' : r >= 3 ? 'Rated 3' : 'Rated 1–2');
const FLOW_PHRASE: Record<string, string> = { High: 'on high-flow days (8+)', Medium: 'on medium-flow days (5–7.9)', Low: 'on low-flow days (under 5)' };

function factorsFor(trades: StandardTrade[], flow: FlowEntry[]): Factor[] {
  const days = dailyFlow(flow);
  const perDay = new Map<string, number>();
  for (const t of trades) perDay.set(t.trade_date, (perDay.get(t.trade_date) ?? 0) + 1);
  const dim = (key: string) => DIMENSIONS.find((d) => d.key === key)!;
  const from = (d: Dimension, phrase: (v: string) => string): Factor => ({ label: d.label, values: d.values, phrase });
  const factors: Factor[] = [
    {
      label: 'Flow',
      values: (t) => {
        const d = days.get(t.trade_date);
        return d ? [flowBand(d.avg).label.split(' ')[0]] : [];
      },
      phrase: (v) => FLOW_PHRASE[v] ?? `on ${v.toLowerCase()} flow days`,
    },
    ...tagGroups(trades).map((g) => ({ label: g.label, values: g.values, phrase: (v: string) => `tagged “${v}”` })),
    from(dim('setup'), (v) => `on ${v} setups`),
    from(dim('trading_session'), (v) => `in the ${v} session`),
    from(dim('weekday'), (v) => `on ${v}s`),
    from(dim('timeframe'), (v) => `on the ${v} timeframe`),
    from(dim('currency_pair'), (v) => `on ${v}`),
    {
      label: 'Rating',
      values: (t) => (typeof t.optional.execution_rating === 'number' ? [RATING_BAND(t.optional.execution_rating)] : []),
      phrase: (v) => `you ${v.toLowerCase()}`,
    },
    {
      label: 'Trades that day',
      values: (t) => [(perDay.get(t.trade_date) ?? 0) >= 3 ? '3+ trades that day' : '1–2 trades that day'],
      phrase: (v) => `on days you took ${v.replace(' that day', '')}`,
    },
  ];
  return factors;
}

/**
 * Values that are over-represented among losing (or winning) trades compared
 * with all trades. Needs at least `minHits` matching trades; under
 * MIN_TAG_SAMPLE they're flagged as low sample.
 */
export function commonFactors(
  trades: StandardTrade[],
  outcome: 'loss' | 'win',
  opts: { flow?: FlowEntry[]; minHits?: number; limit?: number } = {},
): Insight[] {
  const minHits = opts.minHits ?? 3;
  const limit = opts.limit ?? 5;
  const target = trades.filter((t) => outcomeOf(t) === outcome);
  if (target.length < minHits || trades.length < 5) return [];
  const out: Insight[] = [];
  for (const f of factorsFor(trades, opts.flow ?? [])) {
    const vals = new Set(trades.flatMap(f.values));
    for (const value of vals) {
      const has = (t: StandardTrade) => f.values(t).includes(value);
      const withValue = trades.filter(has);
      const hits = target.filter(has).length;
      if (hits < minHits || withValue.length === trades.length) continue;
      const share = hits / target.length;
      const baseline = withValue.length / trades.length;
      // Over-represented by a meaningful margin.
      if (share - baseline < 0.15 || share / baseline < 1.3) continue;
      out.push({
        factor: f.label,
        value,
        phrase: f.phrase(value),
        hits,
        of: target.length,
        baseline,
        share,
        stats: summarise(withValue),
        lowSample: hits < MIN_TAG_SAMPLE,
        score: (share - baseline) * Math.sqrt(hits),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || b.hits - a.hits).slice(0, limit);
}

/** "7 of your 9 losses (78%) came on low-flow days, which make up 30% of all your trades." */
export function insightSentence(i: Insight, outcome: 'loss' | 'win'): string {
  const noun = outcome === 'loss' ? (i.of === 1 ? 'loss' : 'losses') : i.of === 1 ? 'win' : 'wins';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const verb = i.factor === 'Rating' ? 'were trades' : 'came';
  return `${i.hits} of your ${i.of} ${noun} (${pct(i.share)}) ${verb} ${i.phrase} — only ${pct(i.baseline)} of all your trades did.`;
}
