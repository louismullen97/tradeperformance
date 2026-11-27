import type { DailyReview, SyncDailyRequest } from '../../src/domain/review/daily';
import type { NotionDataSource, NotionPropertySchema } from '../../src/sources/notion/types';
import type { NotionClient } from './client';

export type { SyncDailyRequest };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  date: ['date', 'day', 'tradingday', 'reviewdate'],
  performanceScore: ['performance', 'performancescore', 'execution', 'executionscore', 'dayscore', 'score'],
  flowScore: ['flow', 'flowscore', 'flowzone'],
  wins: ['wins', 'goodhabits', 'didwell', 'positive', 'positivetags', 'strengths'],
  mistakes: ['mistakes', 'errors', 'negative', 'negativetags', 'rulebreaks', 'weaknesses'],
  emotions: ['emotions', 'feelings', 'mood', 'psychology'],
  observations: ['observations', 'notes', 'marketnotes', 'summary'],
  decisions: ['decisions', 'keydecisions', 'choices'],
  lesson: ['lesson', 'lessons', 'takeaway', 'learning', 'keylesson'],
} as const;

const titleFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dailyTitle = (date: string) => titleFmt.format(new Date(`${date}T00:00:00Z`)).replace(',', '');

const rich = (s: string | null) => (s ? [{ type: 'text', text: { content: s.slice(0, 2000) } }] : []);

function find(ds: NotionDataSource, key: keyof typeof ALIASES, types: string[]): NotionPropertySchema | undefined {
  const props = Object.values(ds.properties) as NotionPropertySchema[];
  return props.find((p) => types.includes(p.type) && (ALIASES[key] as readonly string[]).includes(norm(p.name)));
}

/** Notion property values for a daily review, for whichever matching properties the database has. */
export function dailyProperties(ds: NotionDataSource, e: DailyReview): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const title = (Object.values(ds.properties) as NotionPropertySchema[]).find((p) => p.type === 'title');
  if (title) out[title.name] = { title: rich(dailyTitle(e.date)) };
  const date = find(ds, 'date', ['date']) ?? (Object.values(ds.properties) as NotionPropertySchema[]).find((p) => p.type === 'date');
  if (date) out[date.name] = { date: { start: e.date } };
  for (const key of ['performanceScore', 'flowScore'] as const) {
    const p = find(ds, key, ['number']);
    if (p) out[p.name] = { number: e[key] };
  }
  for (const key of ['wins', 'mistakes', 'emotions'] as const) {
    const p = find(ds, key, ['multi_select', 'rich_text']);
    // Notion option names can't contain commas.
    if (p) out[p.name] = p.type === 'multi_select' ? { multi_select: e[key].map((name) => ({ name: name.replace(/,/g, ' ') })) } : { rich_text: rich(e[key].join(', ') || null) };
  }
  for (const key of ['observations', 'decisions', 'lesson'] as const) {
    const p = find(ds, key, ['rich_text']);
    if (p) out[p.name] = { rich_text: rich(e[key]) };
  }
  return out;
}

/**
 * Creates the day's page, or updates it if the database already has a page
 * for that date (so syncing twice never duplicates a day).
 */
export async function upsertDailyPage(client: NotionClient, req: SyncDailyRequest): Promise<{ id: string; url: string; created: boolean }> {
  const ds = await client.retrieveDataSource(req.dataSourceId);
  const properties = dailyProperties(ds, req.entry);
  const date = find(ds, 'date', ['date']) ?? (Object.values(ds.properties) as NotionPropertySchema[]).find((p) => p.type === 'date');

  let existing: { id: string; url: string } | undefined;
  if (date) {
    const res = await client.request<{ results: { id: string; url: string; in_trash?: boolean }[] }>('POST', `/data_sources/${encodeURIComponent(ds.id)}/query`, {
      filter: { property: date.name, date: { equals: req.entry.date } },
      page_size: 1,
      result_type: 'page',
    });
    existing = res.results.find((p) => !p.in_trash);
  }
  if (existing) {
    const page = await client.request<{ id: string; url: string }>('PATCH', `/pages/${existing.id}`, { properties });
    return { id: page.id, url: page.url, created: false };
  }
  const page = await client.request<{ id: string; url: string }>('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: ds.id },
    icon: { type: 'emoji', emoji: '🗓️' },
    properties,
  });
  return { id: page.id, url: page.url, created: true };
}
