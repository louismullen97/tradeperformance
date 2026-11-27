import { PLAN_KIND, type SyncPlanRequest } from '../../src/domain/review/daily';
import type { NotionDataSource, NotionPropertySchema } from '../../src/sources/notion/types';
import type { NotionClient } from './client';

export type { SyncPlanRequest };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STATUS = { open: 'Open', kept: 'Kept', missed: 'Missed' } as const;

export function planProperties(ds: NotionDataSource, req: SyncPlanRequest): Record<string, unknown> {
  const props = Object.values(ds.properties) as NotionPropertySchema[];
  const find = (types: string[], names: string[]) => props.find((p) => types.includes(p.type) && names.includes(norm(p.name)));
  const out: Record<string, unknown> = {};
  const title = props.find((p) => p.type === 'title');
  if (title) out[title.name] = { title: [{ type: 'text', text: { content: req.item.text.slice(0, 2000) } }] };
  const kind = find(['select'], ['type', 'kind', 'category', 'level']);
  if (kind) out[kind.name] = { select: { name: PLAN_KIND[req.period] } };
  const date = find(['date'], ['period', 'date', 'week', 'month', 'quarter', 'for']) ?? props.find((p) => p.type === 'date');
  if (date) out[date.name] = { date: { start: req.start, end: req.end } };
  const status = find(['select', 'status'], ['status', 'result', 'outcome']);
  if (status) out[status.name] = status.type === 'status' ? { status: { name: STATUS[req.item.status] } } : { select: { name: STATUS[req.item.status] } };
  return out;
}

export async function syncPlanPage(client: NotionClient, req: SyncPlanRequest): Promise<{ id: string; url: string }> {
  const pageId = req.item.notion?.pageId;
  if (req.archive) {
    if (!pageId) return { id: '', url: '' };
    const page = await client.request<{ id: string; url: string }>('PATCH', `/pages/${pageId}`, { in_trash: true });
    return { id: page.id, url: page.url };
  }
  const ds = await client.retrieveDataSource(req.dataSourceId);
  const properties = planProperties(ds, req);
  if (pageId) {
    const page = await client.request<{ id: string; url: string }>('PATCH', `/pages/${pageId}`, { properties });
    return { id: page.id, url: page.url };
  }
  const page = await client.request<{ id: string; url: string }>('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: ds.id },
    properties,
  });
  return { id: page.id, url: page.url };
}
