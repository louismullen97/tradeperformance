import type { IncomingMessage, ServerResponse } from 'node:http';
import { NewsCache } from './cache';
import { FairEconomyWeeklyProvider } from './provider';

let cache: NewsCache | null = null;

/** GET /api/news?from=YYYY-MM-DD&to=YYYY-MM-DD → { events, stale, error? } */
export async function handleNewsApi(req: IncomingMessage, res: ServerResponse, opts: { cachePath: string }) {
  cache ??= new NewsCache(new FairEconomyWeeklyProvider(), opts.cachePath);
  const url = new URL(req.url ?? '/', 'http://local');
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if ((from && !iso.test(from)) || (to && !iso.test(to))) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'from/to must be YYYY-MM-DD' }));
    return;
  }
  const result = await cache.events(from, to);
  res.end(JSON.stringify(result));
}
