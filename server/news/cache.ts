import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NewsEvent } from '../../src/domain/news/types';
import type { NewsProvider } from './provider';

interface CacheFile {
  fetchedAt: string | null;
  events: NewsEvent[];
}

/**
 * Accumulating news cache. Each refresh merges the provider's events into what
 * is stored, so weeks seen before stay available after the feed moves on.
 * Refreshes at most once per `ttlMs` to respect the provider's rate limits.
 */
export class NewsCache {
  private state: CacheFile | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly provider: NewsProvider,
    private readonly path: string,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  private async load(): Promise<CacheFile> {
    if (this.state) return this.state;
    try {
      this.state = JSON.parse(await readFile(this.path, 'utf8')) as CacheFile;
    } catch {
      this.state = { fetchedAt: null, events: [] };
    }
    return this.state;
  }

  private async refreshIfStale(): Promise<void> {
    const state = await this.load();
    const age = state.fetchedAt ? this.now() - Date.parse(state.fetchedAt) : Infinity;
    if (age < this.ttlMs) return;
    this.inflight ??= (async () => {
      try {
        const fresh = await this.provider.fetchEvents();
        const byId = new Map(state.events.map((e) => [e.id, e]));
        for (const e of fresh) byId.set(e.id, e);
        this.state = { fetchedAt: new Date(this.now()).toISOString(), events: [...byId.values()].sort((a, b) => a.datetime.localeCompare(b.datetime)) };
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path, JSON.stringify(this.state));
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
  }

  /** Events between two ISO dates (inclusive). Serves cached data if the provider fails. */
  async events(from?: string, to?: string): Promise<{ events: NewsEvent[]; stale: boolean; error?: string }> {
    let error: string | undefined;
    try {
      await this.refreshIfStale();
    } catch (e) {
      error = e instanceof Error ? e.message : 'News refresh failed';
    }
    const state = await this.load();
    const events = state.events.filter((e) => (!from || e.datetime.slice(0, 10) >= addDays(from, -1)) && (!to || e.datetime.slice(0, 10) <= addDays(to, 1)));
    return { events, stale: !!error, error };
  }
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
