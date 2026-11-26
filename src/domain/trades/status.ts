import type { StandardTrade } from './types';

/**
 * Taken and missed trades live in the same source database. Missed trades
 * record what the trade *would* have done; they're excluded from journal and
 * performance stats and only analysed on the Missed Trades page.
 */
export function isMissed(t: StandardTrade): boolean {
  return t.optional.trade_status === 'missed';
}

export const takenOnly = (trades: StandardTrade[]) => trades.filter((t) => !isMissed(t));
export const missedOnly = (trades: StandardTrade[]) => trades.filter(isMissed);
