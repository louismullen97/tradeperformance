import type { StandardTrade } from '../trades/types';

/**
 * Categorical ways to slice trades. Each dimension returns the values a trade
 * belongs to — usually one, but multi-valued fields (accounts, tags) can
 * return several, so a trade on two accounts counts towards both.
 */
export interface Dimension {
  key: string;
  label: string;
  values: (t: StandardTrade) => string[];
  /** Fixed display order (e.g. weekdays); otherwise sorted by trade count. */
  order?: string[];
}

const text = (t: StandardTrade, key: string): string[] => {
  const v = t.optional[key];
  if (typeof v === 'string' && v.trim()) return v.split(/\s*,\s*/).filter(Boolean);
  if (Array.isArray(v)) return v.filter(Boolean);
  return [];
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function weekdayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(d + 6) % 7];
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DIMENSIONS: Dimension[] = [
  { key: 'setup', label: 'Setup', values: (t) => [t.setup] },
  { key: 'management_style', label: 'Management', values: (t) => text(t, 'management_style') },
  { key: 'timeframe', label: 'Timeframe', values: (t) => text(t, 'timeframe') },
  { key: 'trading_session', label: 'Session', values: (t) => text(t, 'trading_session') },
  { key: 'currency_pair', label: 'Pair', values: (t) => [t.currency_pair] },
  { key: 'direction', label: 'Direction', values: (t) => text(t, 'direction').map(titleCase) },
  { key: 'entry_type', label: 'Entry type', values: (t) => text(t, 'entry_type') },
  { key: 'account', label: 'Account', values: (t) => text(t, 'account') },
  { key: 'missed_reason', label: 'Missed reason', values: (t) => text(t, 'missed_reason') },
  { key: 'weekday', label: 'Day of week', values: (t) => [weekdayOf(t.trade_date)], order: WEEKDAYS },
];

export function getDimension(key: string): Dimension {
  const d = DIMENSIONS.find((x) => x.key === key);
  if (!d) throw new Error(`Unknown dimension ${key}`);
  return d;
}

/** Dimensions that actually have data in this set of trades. */
export function availableDimensions(trades: StandardTrade[]): Dimension[] {
  return DIMENSIONS.filter((d) => trades.some((t) => d.values(t).length > 0));
}

export function distinctValues(trades: StandardTrade[], dim: Dimension): string[] {
  const counts = new Map<string, number>();
  for (const t of trades) for (const v of dim.values(t)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = [...counts.keys()];
  if (dim.order) return dim.order.filter((k) => counts.has(k));
  return keys.sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
}
