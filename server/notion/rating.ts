import type { SyncRatingRequest } from '../../src/domain/review/rating';
import type { NotionPropertySchema } from '../../src/sources/notion/types';
import type { NotionClient } from './client';

export type { SyncRatingRequest };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const REVIEW_NAMES = ['reviewrating', 'reviewrating15', 'postreviewrating', 'asrrating', 'rerating'];

/** Writes the review rating onto the trade's page in the journal. */
export async function syncReviewRating(client: NotionClient, req: SyncRatingRequest): Promise<{ id: string; url: string; property: string }> {
  const ds = await client.retrieveDataSource(req.dataSourceId);
  const prop = (Object.values(ds.properties) as NotionPropertySchema[]).find((p) => p.type === 'number' && REVIEW_NAMES.includes(norm(p.name)));
  if (!prop) throw new Error('Your journal has no "Review rating (1-5)" number column. Add one in Notion and try again.');
  const page = await client.request<{ id: string; url: string }>('PATCH', `/pages/${req.pageId}`, { properties: { [prop.name]: { number: req.value } } });
  return { id: page.id, url: page.url, property: prop.name };
}
