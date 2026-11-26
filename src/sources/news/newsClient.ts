import type { NewsEvent } from '../../domain/news/types';

/** Fetch economic events for a date range from our backend. Never throws: news is optional. */
export async function fetchNews(from: string, to: string): Promise<NewsEvent[]> {
  try {
    const res = await fetch(`/api/news?from=${from}&to=${to}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { events?: NewsEvent[] };
    return body.events ?? [];
  } catch {
    return [];
  }
}
