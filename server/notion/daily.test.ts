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

import { ratingGaps } from '../../src/domain/review/rating';
import { syncReviewRating } from './rating';
import { planProperties } from './plans';
import type { StandardTrade } from '../../src/domain/trades/types';

describe('review rating', () => {
  const tr = (id: string, orig: number, review: number | null, behaviour: string[] = []): StandardTrade => ({
    id, trade_date: '2026-11-24', currency_pair: 'EURUSD', setup: '3 Touch', risk_percentage: 0.25, result_r: 1, profit_loss_percentage: 0.25,
    optional: { execution_rating: orig, review_rating: review, behaviour_tags: behaviour },
    source: { kind: 'notion', datasetId: 'd', datasetName: 'J', recordId: id, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
  });
  it('finds trades rated more generously at the time', () => {
    const g = ratingGaps([tr('a', 5, 2, ['FOMO entry']), tr('b', 4, 2, ['FOMO entry']), tr('c', 3, 3), tr('d', 2, 4), tr('e', 4, null)]);
    expect(g).toMatchObject({ compared: 4, rated: 5, avgOriginal: 3.5, avgReview: 2.8, lowSample: true });
    expect(g.overrated.map((t) => t.id)).toEqual(['a', 'b']);
    expect(g.underrated.map((t) => t.id)).toEqual(['d']);
    expect(g.overratedTags[0]).toEqual({ group: 'Behaviour', tag: 'FOMO entry', count: 2 });
  });
  it('writes the review rating to the matching column', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const impl = (async (input: URL, init: RequestInit) => {
      const path = new URL(input).pathname.replace('/v1', '');
      calls.push({ method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body as string) : undefined });
      const json = path.startsWith('/data_sources/')
        ? { id: 'ds', properties: { Rating: { id: 'r', name: 'Rating(1-5)', type: 'number', number: {} }, Review: { id: 'v', name: 'Review rating (1-5)', type: 'number', number: {} } } }
        : { id: 'pg', url: 'u' };
      return new Response(JSON.stringify(json));
    }) as unknown as typeof fetch;
    const client = new NotionClient({ token: 's', fetchImpl: impl, minIntervalMs: 0, sleep: async () => {} });
    const res = await syncReviewRating(client, { dataSourceId: 'ds', pageId: 'pg', value: 3 });
    expect(res.property).toBe('Review rating (1-5)');
    expect(calls[1]).toEqual({ method: 'PATCH', path: '/pages/pg', body: { properties: { 'Review rating (1-5)': { number: 3 } } } });
  });
  it('syncs focus area source and goal to Plans', () => {
    const plansDs = { object: 'data_source', id: 'p', title: [], last_edited_time: '', properties: {
      Name: { id: 't', name: 'Name', type: 'title', title: {} }, Source: { id: 's', name: 'Source', type: 'rich_text', rich_text: {} }, Goal: { id: 'g', name: 'Goal', type: 'select', select: { options: [] } },
    } } as unknown as NotionDataSource;
    const props = planProperties(plansDs, { dataSourceId: 'p', item: { id: 'x', text: 'Revenge trading', status: 'open', source: 'behaviour=Revenge trading', goal: 'fewer' }, period: 'month', start: '2026-11-27', end: '2026-11-30' });
    expect(props.Source).toEqual({ rich_text: [{ type: 'text', text: { content: 'behaviour=Revenge trading' } }] });
    expect(props.Goal).toEqual({ select: { name: 'Fewer occurrences' } });
  });
});
