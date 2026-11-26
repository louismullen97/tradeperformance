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
