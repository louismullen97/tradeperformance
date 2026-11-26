import type { AsrBlock, AsrProperties, CreateAsrRequest, Rich } from '../../src/domain/review/asr';

export type { CreateAsrRequest };
import type { NotionDataSource, NotionPropertySchema } from '../../src/sources/notion/types';
import type { NotionClient } from './client';

/** Converts an ASR document into a Notion page (properties + blocks), uploading chart images. */

type NotionBlock = Record<string, unknown>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function richText(rich: Rich) {
  return rich
    .filter((s) => s.text.length > 0)
    .map((s) => ({
      type: 'text',
      text: { content: s.text.slice(0, 2000), link: s.link ? { url: s.link } : null },
      annotations: { bold: !!s.bold, italic: !!s.italic, strikethrough: false, underline: false, code: false, color: s.color ?? 'default' },
    }));
}
const textOnly = (text: string) => richText([{ text }]);

export function toNotionBlocks(blocks: AsrBlock[], uploads: Record<string, string>): NotionBlock[] {
  const out: NotionBlock[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'heading': {
        const type = b.level === 2 ? 'heading_2' : 'heading_3';
        out.push({ type, [type]: { rich_text: textOnly(b.text) } });
        break;
      }
      case 'paragraph':
        out.push({ type: 'paragraph', paragraph: { rich_text: richText(b.rich) } });
        break;
      case 'bullets':
        for (const item of b.items) out.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(item) } });
        break;
      case 'callout':
        out.push({ type: 'callout', callout: { rich_text: richText(b.rich), icon: { type: 'emoji', emoji: b.emoji }, color: 'gray_background' } });
        break;
      case 'table':
        out.push({
          type: 'table',
          table: {
            table_width: b.header.length,
            has_column_header: true,
            has_row_header: false,
            children: [b.header.map((h) => textOnly(h)), ...b.rows.map((row) => row.map(richText))].map((cells) => ({
              type: 'table_row',
              table_row: { cells },
            })),
          },
        });
        break;
      case 'image': {
        const id = uploads[b.image];
        if (id) out.push({ type: 'image', image: { type: 'file_upload', file_upload: { id }, caption: textOnly(b.caption) } });
        break;
      }
      case 'divider':
        out.push({ type: 'divider', divider: {} });
        break;
      case 'todo':
        out.push({ type: 'to_do', to_do: { rich_text: textOnly(b.text), checked: false } });
        break;
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, '');
const NUMBER_ALIASES: Record<'netR' | 'winRate' | 'trades' | 'netPl', string[]> = {
  netR: ['netr', 'r', 'resultr', 'totalr', 'rmultiple'],
  winRate: ['winrate', 'win%', 'winrate%', 'strikerate', 'hitrate'],
  trades: ['trades', 'tradecount', 'numberoftrades', 'oftrades', 'totaltrades'],
  netPl: ['netpl', 'pl', 'pnl', 'netpnl', 'p&l', 'pl%', 'return', 'return%', 'profit', 'netpl%'],
};
const DATE_ALIASES = ['date', 'period', 'dates', 'week', 'month', 'quarter', 'start', 'reviewdate', 'dateperiod'];
const PERIOD_ALIASES = ['period', 'type', 'reviewtype', 'cadence', 'timeframe', 'review'];

/**
 * Fills whatever properties the chosen database has, matched by name and type.
 * Only the title is required; unknown properties are left alone.
 */
export function asrProperties(ds: NotionDataSource, title: string, p: AsrProperties): Record<string, unknown> {
  const props = Object.values(ds.properties) as NotionPropertySchema[];
  const out: Record<string, unknown> = {};
  const used = new Set<string>();
  const take = (pred: (s: NotionPropertySchema) => boolean) => {
    const hit = props.find((s) => !used.has(s.id) && pred(s));
    if (hit) used.add(hit.id);
    return hit;
  };

  const titleProp = take((s) => s.type === 'title');
  if (titleProp) out[titleProp.name] = { title: textOnly(title) };

  const period = take((s) => (s.type === 'select' || s.type === 'multi_select') && PERIOD_ALIASES.includes(norm(s.name)));
  if (period) out[period.name] = period.type === 'select' ? { select: { name: p.period } } : { multi_select: [{ name: p.period }] };

  const date = take((s) => s.type === 'date' && DATE_ALIASES.includes(norm(s.name))) ?? take((s) => s.type === 'date');
  if (date) out[date.name] = { date: { start: p.start, end: p.end } };

  for (const [key, aliases] of Object.entries(NUMBER_ALIASES) as [keyof typeof NUMBER_ALIASES, string[]][]) {
    const prop = take((s) => s.type === 'number' && aliases.includes(norm(s.name)));
    if (!prop || prop.type !== 'number') continue;
    const percentFormat = prop.number.format === 'percent';
    let value: number | null = p[key];
    if (value === null) continue;
    // Win rate is a fraction; P/L is in percent points. Notion's percent format stores fractions.
    if (key === 'winRate' && !percentFormat) value = Math.round(value * 1000) / 10;
    if (key === 'netPl' && percentFormat) value = Math.round(value * 100) / 10000;
    out[prop.name] = { number: value };
  }
  return out;
}

export async function createAsrPage(client: NotionClient, req: CreateAsrRequest): Promise<{ id: string; url: string }> {
  const ds = await client.retrieveDataSource(req.dataSourceId);

  const uploads: Record<string, string> = {};
  for (const img of req.images) {
    const bytes = Buffer.from(img.base64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) continue;
    const created = await client.request<{ id: string }>('POST', '/file_uploads', { mode: 'single_part', filename: img.filename, content_type: 'image/png' });
    await client.sendFile(created.id, new Blob([bytes], { type: 'image/png' }), img.filename);
    uploads[img.key] = created.id;
  }

  const children = toNotionBlocks(req.document.blocks, uploads);
  const page = await client.request<{ id: string; url: string }>('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: ds.id },
    icon: { type: 'emoji', emoji: req.document.icon },
    properties: asrProperties(ds, req.document.title, req.document.properties),
    children: children.slice(0, 100),
  });
  // Notion accepts at most 100 children per request; append any remainder.
  for (let i = 100; i < children.length; i += 100) {
    await client.request('PATCH', `/blocks/${page.id}/children`, { children: children.slice(i, i + 100) });
  }
  return { id: page.id, url: page.url };
}
