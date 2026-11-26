import { describe, expect, it } from 'vitest';
import { TRADE_FIELDS } from '../../src/domain/fields/registry';
import { createSuggestedConfig } from '../../src/domain/mapping/config';
import { evaluateMapping } from '../../src/domain/mapping/evaluate';
import { validateRecords } from '../../src/domain/validation/validate';
import type { NotionDataSource, NotionPage } from '../../src/sources/notion/types';
import { NotionApiConnector } from './apiConnector';
import { NotionApiError, NotionClient } from './client';
import { describeError } from './handler';

type Call = { method: string; url: URL; body: any; headers: Record<string, string> };

function fakeFetch(handler: (call: Call) => { status?: number; body: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const impl = (async (input: URL, init: RequestInit) => {
    const call: Call = {
      method: init.method ?? 'GET',
      url: new URL(input),
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};
const client = (impl: typeof fetch) => new NotionClient({ token: 'secret', fetchImpl: impl, minIntervalMs: 0, sleep: noSleep });

const rt = (s: string) => [{ type: 'text', plain_text: s }];

const dataSource: NotionDataSource = {
  object: 'data_source',
  id: '11111111-2222-3333-4444-555555555555',
  title: rt('Live Journal'),
  icon: { type: 'external', external: { url: 'https://x/icon.png' } },
  parent: { type: 'database_id', database_id: 'aaaaaaaa-2222-3333-4444-555555555555' },
  last_edited_time: '2026-11-01T10:00:00.000Z',
  in_trash: false,
  properties: {
    Name: { id: 'title', name: 'Name', type: 'title', title: {} },
    'Trade Date': { id: 'dt', name: 'Trade Date', type: 'date', date: {} },
    Pair: { id: 'pr', name: 'Pair', type: 'status', status: { options: [{ name: 'EURUSD' }] } },
    Setup: { id: 'st', name: 'Setup', type: 'select', select: { options: [{ name: 'Breakout' }] } },
    'Risk %': { id: 'rk', name: 'Risk %', type: 'number', number: { format: 'percent' } },
    'R Multiple': { id: 'rr', name: 'R Multiple', type: 'rollup', rollup: {} },
    'Return %': { id: 'pl', name: 'Return %', type: 'formula', formula: { expression: 'x' } },
    ID: { id: 'id', name: 'ID', type: 'unique_id', unique_id: { prefix: 'TR' } },
    Owner: { id: 'ow', name: 'Owner', type: 'people' },
  },
};

const row = (i: number, created: string, over: Partial<NotionPage> = {}): NotionPage => ({
  object: 'page',
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  url: `https://app.notion.com/p/${i}`,
  created_time: created,
  last_edited_time: created,
  in_trash: false,
  parent: { type: 'data_source_id', data_source_id: dataSource.id },
  properties: {
    Name: { id: 'title', type: 'title', title: rt(`Trade ${i}`) },
    'Trade Date': { id: 'dt', type: 'date', date: { start: '2026-10-02', end: null } },
    Pair: { id: 'pr', type: 'status', status: { name: 'EURUSD' } },
    Setup: { id: 'st', type: 'select', select: { name: 'Breakout' } },
    'Risk %': { id: 'rk', type: 'number', number: 0.01 },
    'R Multiple': { id: 'rr', type: 'rollup', rollup: { type: 'number', number: 2 } },
    'Return %': { id: 'pl', type: 'formula', formula: { type: 'number', number: 2 + i / 100 } },
    ID: { id: 'id', type: 'unique_id', unique_id: { prefix: 'TR', number: i } },
    Owner: { id: 'ow', type: 'people' },
  },
  ...over,
});

describe('NotionClient', () => {
  it('sends auth + version headers', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { object: 'user', id: 'b', type: 'bot', bot: { workspace_name: 'WS' } } }));
    await client(impl).me();
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[0].headers['Notion-Version']).toBe('2026-03-11');
  });

  it('retries 429 after Retry-After and gives up on blocked connections', async () => {
    let n = 0;
    const slept: number[] = [];
    const { impl } = fakeFetch(() =>
      ++n < 3
        ? { status: 429, body: { code: 'rate_limited', message: 'slow' }, headers: { 'Retry-After': '2' } }
        : { body: { object: 'user', id: 'b', type: 'bot' } },
    );
    const c = new NotionClient({ token: 't', fetchImpl: impl, minIntervalMs: 0, sleep: async (ms) => void slept.push(ms) });
    await c.me();
    expect(n).toBe(3);
    expect(slept.every((ms) => ms >= 2000)).toBe(true);

    const blocked = fakeFetch(() => ({
      status: 429,
      body: { code: 'rate_limited', message: 'blocked', additional_data: { rate_limit_reason: 'public_api_request_blocked' } },
    }));
    await expect(client(blocked.impl).me()).rejects.toBeInstanceOf(NotionApiError);
    expect(blocked.calls).toHaveLength(1);
  });

  it('does not retry 401', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 401, body: { code: 'unauthorized', message: 'API token is invalid.' } }));
    await expect(client(impl).me()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(calls).toHaveLength(1);
    expect(describeError(new NotionApiError(401, 'unauthorized', 'x')).code).toBe('unauthorized');
  });

  it('lists data sources across search pages and skips trashed ones', async () => {
    const { impl, calls } = fakeFetch((c) =>
      c.body.start_cursor
        ? { body: { object: 'list', results: [{ ...dataSource, id: 'b', in_trash: true }], has_more: false, next_cursor: null } }
        : { body: { object: 'list', results: [dataSource], has_more: true, next_cursor: 'cur1' } },
    );
    const list = await client(impl).listDataSources();
    expect(list.map((d) => d.id)).toEqual([dataSource.id]);
    expect(calls[0].body.filter).toEqual({ property: 'object', value: 'data_source' });
  });

  it('reads past the 10,000-result cap using created_time windows, de-duplicating', async () => {
    const { impl, calls } = fakeFetch((c) => {
      if (!c.body.filter) {
        // first window: two pages, then capped
        if (!c.body.start_cursor) return { body: { object: 'list', results: [row(1, 't1'), row(2, 't2')], has_more: true, next_cursor: 'c' } };
        return {
          body: { object: 'list', results: [row(3, 't3')], has_more: false, next_cursor: null, request_status: { type: 'incomplete', incomplete_reason: 'query_result_limit_reached' } },
        };
      }
      expect(c.body.filter.created_time.on_or_after).toBe('t3');
      return { body: { object: 'list', results: [row(3, 't3'), row(4, 't4'), row(5, 't5', { in_trash: true })], has_more: false, next_cursor: null } };
    });
    const rows = await client(impl).queryAllRows(dataSource.id);
    expect(rows.map((r) => r.id.slice(-1))).toEqual(['1', '2', '3', '4']);
    expect(calls.every((c) => c.body.sorts[0].timestamp === 'created_time')).toBe(true);
  });
});

describe('NotionApiConnector with API-shaped data', () => {
  const { impl } = fakeFetch((c) => {
    const p = c.url.pathname;
    if (p.endsWith('/users/me')) return { body: { object: 'user', id: 'b', type: 'bot', bot: { workspace_name: 'Louis HQ' } } };
    if (p.endsWith('/search')) return { body: { object: 'list', results: [dataSource], has_more: false, next_cursor: null } };
    if (p.endsWith('/query')) return { body: { object: 'list', results: [row(1, 't1'), row(2, 't2')], has_more: false, next_cursor: null } };
    return { body: dataSource };
  });
  const connector = new NotionApiConnector(client(impl));

  it('translates data sources, schema and rows into the domain model', async () => {
    const [ds] = await connector.listDatasets();
    expect(ds).toMatchObject({ name: 'Live Journal', recordCount: null, workspace: 'Louis HQ', icon: undefined });

    const schema = await connector.getSchema(ds.id);
    const types = Object.fromEntries(schema.properties.map((p) => [p.name, p.type]));
    expect(types).toMatchObject({ Pair: 'select', 'R Multiple': 'number', 'Return %': 'number', ID: 'text', Owner: 'unknown' });

    const records = await connector.fetchRecords(ds.id);
    const config = createSuggestedConfig(ds, schema, TRADE_FIELDS);
    expect(evaluateMapping(config, schema.properties, TRADE_FIELDS).summary.mandatoryMapped).toBe(6);

    const report = validateRecords(records, schema.properties, config, TRADE_FIELDS);
    expect(report.counts).toMatchObject({ total: 2, valid: 2 });
    expect(report.records[0].values).toMatchObject({ trade_date: '2026-10-02', currency_pair: 'EURUSD', risk_percentage: 1, result_r: 2 });
    expect(await connector.countRecords(ds.id)).toBe(2);
  });
});
