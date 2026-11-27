import type { CreateAsrRequest } from '../../domain/review/asr';

export interface PublishedReview {
  id: string;
  url: string;
}

/** Sends an ASR to the backend, which creates the page in Notion. */
export async function publishReview(baseUrl: string, body: CreateAsrRequest): Promise<PublishedReview> {
  const res = await fetch(`${baseUrl}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Couldn't create the review (HTTP ${res.status}).`);
  }
  return json as PublishedReview;
}

/** Creates or updates the day's page in a Notion Daily ASR database. */
export async function syncDailyReview(baseUrl: string, body: import('../../domain/review/daily').SyncDailyRequest): Promise<PublishedReview & { created: boolean }> {
  const res = await fetch(`${baseUrl}/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Couldn't save to Notion (HTTP ${res.status}).`);
  }
  return json as PublishedReview & { created: boolean };
}

/** Creates, updates or archives one plan item's page in a Notion Plans database. */
export async function syncPlanItem(baseUrl: string, body: import('../../domain/review/daily').SyncPlanRequest): Promise<PublishedReview> {
  const res = await fetch(`${baseUrl}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Couldn't sync to Notion (HTTP ${res.status}).`);
  }
  return json as PublishedReview;
}

/** Saves a trade's review rating to its page in the Notion journal. */
export async function syncTradeRating(baseUrl: string, body: import('../../domain/review/rating').SyncRatingRequest): Promise<PublishedReview> {
  const res = await fetch(`${baseUrl}/trade-rating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Couldn't save the rating to Notion (HTTP ${res.status}).`);
  }
  return json as PublishedReview;
}
