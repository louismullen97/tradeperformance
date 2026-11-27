import { describe, expect, it } from 'vitest';
import { periodRange } from '../../src/domain/analytics/review';
import { buildAsr } from '../../src/domain/review/asr';
import type { StandardTrade } from '../../src/domain/trades/types';
import type { NotionDataSource } from '../../src/sources/notion/types';
import { asrProperties, createAsrPage, toNotionBlocks } from './asr';
import { NotionClient } from './client';

let n = 0;
const t = (date: string, r: number, setup: string, opt: Record<string, unknown> = {}): StandardTrade => ({
  id: `a${++n}`, trade_date: date, currency_pair: 'GBPUSD', setup, risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: opt as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `a${n}`, recordUrl: `https://notion.so/a${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

const range = periodRange('month', '2026-11-10');
const taken = [
  t('2026-11-03', 2, '3 Touch', { positive_tags: ['Patient entry'] }),
  t('2026-11-05', -1, '2 Touch', { negative_tags: ['Early entry'] }),
  t('2026-11-12', 3, 'V-Shape'),
];
const prevTaken = [t('2026-10-10', -1, '2 Touch')];
const missed = [t('2026-11-07', 2.5, '3 Touch', { trade_status: 'missed', missed_reason: 'Away from desk' })];

const doc = buildAsr({ period: 'month', range, taken, prevTaken, missed, images: ['equity', 'missed'] });

describe('buildAsr', () => {
  it('summarises the period', () => {
    expect(doc.title).toBe('Monthly review · November 2026');
    expect(doc.properties).toMatchObject({ period: 'Monthly', start: '2026-11-01', end: '2026-11-30', netR: 4, trades: 3, netPl: 1 });
    expect(doc.properties.winRate).toBeCloseTo(0.667, 3);
  });
  it('includes scorecard, charts, trades, behaviour, missed and reflection sections', () => {
    const headings = doc.blocks.filter((b) => b.type === 'heading').map((b) => (b as { text: string }).text);
    expect(headings).toEqual(expect.arrayContaining(['Scorecard', 'Equity', 'Setups', 'Best & worst trades', 'Behaviour', 'Missed trades', 'Reflection']));
    const scorecard = doc.blocks.find((b) => b.type === 'table')!;
    expect(scorecard.type === 'table' && scorecard.rows[0].map((c) => c.map((s) => s.text).join(''))).toEqual(['Net R', '+4.00R', '−1.00R', '+5.00R']);
    expect(doc.blocks.filter((b) => b.type === 'image').map((b) => (b as { image: string }).image)).toEqual(['equity', 'missed']);
  });
  it('links trades back to their Notion pages', () => {
    const at = doc.blocks.findIndex((b) => b.type === 'heading' && b.text === 'Best');
    const best = doc.blocks[at + 1];
    expect(best.type === 'bullets' && best.items[0][0]).toMatchObject({ text: 'GBPUSD', link: 'https://notion.so/a3' });
  });
  it('omits the chart section when no images are attached', () => {
    const plain = buildAsr({ period: 'week', range: periodRange('week', '2026-11-10'), taken, prevTaken: [], missed: [] });
    expect(plain.blocks.some((b) => b.type === 'image' || (b.type === 'heading' && b.text === 'Equity'))).toBe(false);
  });
});

describe('Notion conversion', () => {
  it('turns blocks into Notion blocks and drops images that were not uploaded', () => {
    const blocks = toNotionBlocks(doc.blocks, { equity: 'up_1' });
    const images = blocks.filter((b) => b.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ image: { type: 'file_upload', file_upload: { id: 'up_1' } } });
    const table = blocks.find((b) => b.type === 'table') as { table: { table_width: number; children: unknown[] } };
    expect(table.table.table_width).toBe(4);
    expect(table.table.children).toHaveLength(9);
    const reflection = blocks.filter((b) => b.type === 'paragraph').at(-1) as { paragraph: { rich_text: unknown[] } };
    expect(reflection.paragraph.rich_text).toEqual([]);
  });

  const ds = (properties: Record<string, unknown>): NotionDataSource =>
    ({ object: 'data_source', id: 'd', title: [], last_edited_time: '', properties }) as unknown as NotionDataSource;

  it('fills matching properties by name and type', () => {
    const props = asrProperties(
      ds({
        Name: { id: 't', name: 'Name', type: 'title', title: {} },
        Period: { id: 'p', name: 'Period', type: 'select', select: { options: [] } },
        Date: { id: 'd', name: 'Date', type: 'date', date: {} },
        'Net R': { id: 'r', name: 'Net R', type: 'number', number: { format: 'number' } },
        'Win rate': { id: 'w', name: 'Win rate', type: 'number', number: { format: 'percent' } },
        'P/L %': { id: 'pl', name: 'P/L %', type: 'number', number: { format: 'percent' } },
        Trades: { id: 'n', name: 'Trades', type: 'number', number: { format: 'number' } },
        Notes: { id: 'x', name: 'Notes', type: 'rich_text', rich_text: {} },
      }),
      doc.title,
      doc.properties,
    );
    expect(props).toEqual({
      Name: { title: [expect.objectContaining({ text: { content: 'Monthly review · November 2026', link: null } })] },
      Period: { select: { name: 'Monthly' } },
      Date: { date: { start: '2026-11-01', end: '2026-11-30' } },
      'Net R': { number: 4 },
      'Win rate': { number: 0.667 },
      'P/L %': { number: 0.01 },
      Trades: { number: 3 },
    });
  });
  it('stores win rate as percent points in a plain number column', () => {
    const props = asrProperties(ds({ T: { id: 't', name: 'Title', type: 'title', title: {} }, W: { id: 'w', name: 'Win Rate', type: 'number', number: { format: 'number' } } }), 'x', doc.properties);
    expect(props['Win Rate']).toEqual({ number: 66.7 });
  });
});

describe('createAsrPage', () => {
  it('uploads images, then creates the page under the data source', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const impl = (async (input: URL, init: RequestInit) => {
      const path = new URL(input).pathname.replace('/v1', '');
      const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method: init.method ?? 'GET', path, body });
      const json =
        path.startsWith('/data_sources/') ? { object: 'data_source', id: 'ds-1', properties: { Name: { id: 't', name: 'Name', type: 'title', title: {} } } }
        : path === '/file_uploads' ? { id: 'fu-1' }
        : path.endsWith('/send') ? { id: 'fu-1', status: 'uploaded' }
        : { id: 'page-1', url: 'https://www.notion.so/page-1' };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new NotionClient({ token: 's', fetchImpl: impl, minIntervalMs: 0, sleep: async () => {} });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const result = await createAsrPage(client, { dataSourceId: '11111111-2222-3333-4444-555555555555', document: doc, images: [{ key: 'equity', filename: 'equity.png', base64: png }] });

    expect(result).toEqual({ id: 'page-1', url: 'https://www.notion.so/page-1' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /data_sources/11111111-2222-3333-4444-555555555555', 'POST /file_uploads', 'POST /file_uploads/fu-1/send', 'POST /pages']);
    expect(calls[2].body).toBeInstanceOf(FormData);
    const page = calls[3].body as { parent: unknown; children: { type: string }[] };
    expect(page.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-1' });
    expect(page.children.filter((c) => c.type === 'image')).toHaveLength(1);
  });

  it('does not retry a page create after a server error', async () => {
    let posts = 0;
    const impl = (async (input: URL) => {
      const path = new URL(input).pathname;
      if (path.includes('/data_sources/')) return new Response(JSON.stringify({ id: 'ds', properties: {} }));
      posts++;
      return new Response(JSON.stringify({ code: 'internal_server_error', message: 'boom' }), { status: 500 });
    }) as unknown as typeof fetch;
    const client = new NotionClient({ token: 's', fetchImpl: impl, minIntervalMs: 0, sleep: async () => {} });
    await expect(createAsrPage(client, { dataSourceId: 'x', document: doc, images: [] })).rejects.toThrow('boom');
    expect(posts).toBe(1);
  });
});
