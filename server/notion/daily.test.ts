import { describe, expect, it } from 'vitest';
import { emptyDaily } from '../../src/domain/review/daily';
import type { NotionDataSource } from '../../src/sources/notion/types';
import { NotionClient } from './client';
import { dailyProperties, upsertDailyPage } from './daily';

const ds = {
  object: 'data_source',
  id: 'ds-1',
  title: [],
  last_edited_time: '',
  properties: {
    Name: { id: 't', name: 'Name', type: 'title', title: {} },
    Date: { id: 'd', name: 'Date', type: 'date', date: {} },
    Performance: { id: 'p', name: 'Performance', type: 'number', number: { format: 'number' } },
    Flow: { id: 'f', name: 'Flow', type: 'number', number: { format: 'number' } },
    Wins: { id: 'w', name: 'Wins', type: 'multi_select', multi_select: { options: [] } },
    Mistakes: { id: 'm', name: 'Mistakes', type: 'multi_select', multi_select: { options: [] } },
    Emotions: { id: 'e', name: 'Emotions', type: 'multi_select', multi_select: { options: [] } },
    Lesson: { id: 'l', name: 'Lesson', type: 'rich_text', rich_text: {} },
  },
} as unknown as NotionDataSource;

const entry = { ...emptyDaily('2026-11-24'), performanceScore: 8, flowScore: 7, wins: ['Avoided a poor trade'], mistakes: ['Overtraded, twice'], lesson: 'Wait for the close' };

describe('daily sync', () => {
  it('maps a daily review onto matching properties', () => {
    expect(dailyProperties(ds, entry)).toEqual({
      Name: { title: [{ type: 'text', text: { content: 'Tue 24 Nov 2026' } }] },
      Date: { date: { start: '2026-11-24' } },
      Performance: { number: 8 },
      Flow: { number: 7 },
      Wins: { multi_select: [{ name: 'Avoided a poor trade' }] },
      Mistakes: { multi_select: [{ name: 'Overtraded  twice' }] },
      Emotions: { multi_select: [] },
      Lesson: { rich_text: [{ type: 'text', text: { content: 'Wait for the close' } }] },
    });
  });

  const run = async (existing: boolean) => {
    const calls: string[] = [];
    const impl = (async (input: URL, init: RequestInit) => {
      const path = new URL(input).pathname.replace('/v1', '');
      calls.push(`${init.method} ${path}`);
      const json = path.startsWith('/data_sources/') && !path.endsWith('/query') ? ds : path.endsWith('/query') ? { results: existing ? [{ id: 'pg', url: 'u' }] : [] } : { id: 'pg', url: 'u' };
      return new Response(JSON.stringify(json));
    }) as unknown as typeof fetch;
    const client = new NotionClient({ token: 's', fetchImpl: impl, minIntervalMs: 0, sleep: async () => {} });
    const res = await upsertDailyPage(client, { dataSourceId: 'ds-1', entry });
    return { calls, res };
  };
  it('creates the page when the day has none', async () => {
    const { calls, res } = await run(false);
    expect(calls).toEqual(['GET /data_sources/ds-1', 'POST /data_sources/ds-1/query', 'POST /pages']);
    expect(res.created).toBe(true);
  });
  it("updates the day's existing page instead of duplicating it", async () => {
    const { calls, res } = await run(true);
    expect(calls.at(-1)).toBe('PATCH /pages/pg');
    expect(res.created).toBe(false);
  });
});
