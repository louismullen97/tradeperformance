import type { StandardTrade } from './types';

export type Outcome = 'win' | 'loss' | 'breakeven';

/** Outcome is judged on R: above 0 wins, below 0 loses, exactly 0 is breakeven. */
export function outcomeOf(t: StandardTrade): Outcome {
  if (t.result_r > 0) return 'win';
  if (t.result_r < 0) return 'loss';
  return 'breakeven';
}

export interface TradeSummary {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Wins ÷ (wins + losses); breakevens excluded. Null with no decided trades. */
  winRate: number | null;
  netR: number;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  /** Gross winning R ÷ gross losing R. Null when there are no losses. */
  profitFactor: number | null;
  /** Sum of per-trade P/L % (simple, not compounded). */
  netPl: number;
  avgRisk: number | null;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarise(trades: StandardTrade[]): TradeSummary {
  const wins = trades.filter((t) => outcomeOf(t) === 'win');
  const losses = trades.filter((t) => outcomeOf(t) === 'loss');
  const grossWin = wins.reduce((a, t) => a + t.result_r, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.result_r, 0);
  const decided = wins.length + losses.length;
  const opt = (n: number | null) => (n === null ? null : round(n));

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: trades.length - decided,
    winRate: decided ? round(wins.length / decided) : null,
    netR: round(trades.reduce((a, t) => a + t.result_r, 0)),
    avgR: opt(mean(trades.map((t) => t.result_r))),
    avgWinR: opt(mean(wins.map((t) => t.result_r))),
    avgLossR: opt(mean(losses.map((t) => t.result_r))),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
    netPl: round(trades.reduce((a, t) => a + t.profit_loss_percentage, 0)),
    avgRisk: opt(mean(trades.map((t) => t.risk_percentage))),
  };
}

/** Running total of R in date order — the basis of an equity curve. */
export function cumulativeR(trades: StandardTrade[]): { date: string; r: number }[] {
  let total = 0;
  return [...trades]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((t) => {
      total = round(total + t.result_r);
      return { date: t.trade_date, r: total };
    });
}
