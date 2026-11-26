import type { NewsEvent, NewsImpact } from '../../src/domain/news/types';

/** Any economic-calendar source. A paid provider with history can implement this later. */
export interface NewsProvider {
  readonly name: string;
  fetchEvents(): Promise<NewsEvent[]>;
}

interface FairEconomyEvent {
  title: string;
  country: string;
  date: string; // ISO with offset
  impact: string; // High | Medium | Low | Holiday | Non-Economic
  forecast?: string;
  previous?: string;
}

const IMPACT: Record<string, NewsImpact> = { high: 'high', medium: 'medium', low: 'low', holiday: 'holiday' };

export function eventId(e: { datetime: string; currency: string; title: string }) {
  return `${e.datetime}|${e.currency}|${e.title}`.toLowerCase();
}

export function parseFairEconomy(rows: FairEconomyEvent[]): NewsEvent[] {
  return rows
    .filter((r) => r && r.title && r.date && IMPACT[String(r.impact).toLowerCase()])
    .map((r) => {
      const base = { datetime: r.date, currency: r.country.toUpperCase(), title: r.title.trim() };
      return {
        ...base,
        id: eventId(base),
        impact: IMPACT[r.impact.toLowerCase()],
        forecast: r.forecast || undefined,
        previous: r.previous || undefined,
      };
    });
}

/**
 * ForexFactory's public weekly calendar feed (free, no key). It only covers
 * the current week, so the server keeps every week it has seen in a cache.
 */
export class FairEconomyWeeklyProvider implements NewsProvider {
  readonly name = 'ForexFactory weekly feed';
  constructor(
    private readonly url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchEvents(): Promise<NewsEvent[]> {
    const res = await this.fetchImpl(this.url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`News feed returned HTTP ${res.status}`);
    return parseFairEconomy((await res.json()) as FairEconomyEvent[]);
  }
}
