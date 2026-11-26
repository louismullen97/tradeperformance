import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupByLocalDate } from '../../src/domain/news/types';
import { NewsCache } from './cache';
import { parseFairEconomy, type NewsProvider } from './provider';

const FEED = [
  { title: 'Non-Farm Employment Change', country: 'USD', date: '2026-11-06T08:30:00-05:00', impact: 'High', forecast: '120K', previous: '98K' },
  { title: 'CPI y/y', country: 'GBP', date: '2026-11-18T07:00:00+00:00', impact: 'High' },
  { title: 'Retail Sales m/m', country: 'AUD', date: '2026-11-04T19:30:00-05:00', impact: 'Medium' },
  { title: 'Bank Holiday', country: 'JPY', date: '2026-11-03T00:00:00-05:00', impact: 'Holiday' },
  { title: 'Speech', country: 'EUR', date: '2026-11-05T10:00:00+01:00', impact: 'Non-Economic' },
];

describe('news', () => {
  it('parses the weekly feed and drops non-economic rows', () => {
    const events = parseFairEconomy(FEED);
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ currency: 'USD', impact: 'high', forecast: '120K' });
  });

  it('groups high-impact events by local date', () => {
    const london = groupByLocalDate(parseFairEconomy(FEED), 'Europe/London');
    expect([...london.keys()]).toEqual(['2026-11-06', '2026-11-18']);
    expect(london.get('2026-11-06')![0].time).toBe('13:30');
    // AUD retail sales at 19:30 New York is the next morning in Sydney — and medium impact, so excluded.
    expect(groupByLocalDate(parseFairEconomy(FEED), 'Australia/Sydney', 'medium').has('2026-11-05')).toBe(true);
  });

  it('accumulates weeks in the cache and serves stale data when the feed fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'news-'));
    let call = 0;
    let now = Date.parse('2026-11-06T12:00:00Z');
    const provider: NewsProvider = {
      name: 'fake',
      async fetchEvents() {
        call++;
        if (call === 1) return parseFairEconomy([FEED[0]]);
        if (call === 2) return parseFairEconomy([FEED[1]]);
        throw new Error('down');
      },
    };
    const cache = new NewsCache(provider, join(dir, 'news.json'), 60_000, () => now);
    expect((await cache.events()).events).toHaveLength(1);
    expect((await cache.events()).events).toHaveLength(1); // within TTL — no refetch
    expect(call).toBe(1);
    now += 120_000;
    expect((await cache.events()).events).toHaveLength(2); // week 2 merged, week 1 kept
    now += 120_000;
    const r = await cache.events('2026-11-01', '2026-11-30');
    expect(r).toMatchObject({ stale: true, error: 'down' });
    expect(r.events).toHaveLength(2);
    const reopened = new NewsCache(provider, join(dir, 'news.json'), 10 * 60_000, () => now);
    expect((await reopened.events()).events).toHaveLength(2); // persisted to disk
  });
});
