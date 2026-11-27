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
