export type NewsImpact = 'high' | 'medium' | 'low' | 'holiday';

/** One scheduled economic release, provider-independent. */
export interface NewsEvent {
  id: string;
  /** Release time as an ISO 8601 timestamp with offset. */
  datetime: string;
  /** Three-letter currency affected, e.g. USD. */
  currency: string;
  title: string;
  impact: NewsImpact;
  forecast?: string;
  previous?: string;
  /** Local display fields, filled in by `groupByLocalDate`. */
  date?: string;
  time?: string;
}

/**
 * Group events by the trader's local calendar date (a 13:30 London release
 * belongs to that London day). Only events at or above `minImpact` are kept.
 */
export function groupByLocalDate(
  events: NewsEvent[],
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  minImpact: NewsImpact = 'high',
): Map<string, NewsEvent[]> {
  const rank: Record<NewsImpact, number> = { holiday: 0, low: 1, medium: 2, high: 3 };
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const out = new Map<string, NewsEvent[]>();
  for (const e of events) {
    if (rank[e.impact] < rank[minImpact]) continue;
    const d = new Date(e.datetime);
    if (Number.isNaN(d.getTime())) continue;
    const date = dateFmt.format(d);
    const list = out.get(date) ?? [];
    list.push({ ...e, date, time: timeFmt.format(d) });
    out.set(date, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return out;
}
