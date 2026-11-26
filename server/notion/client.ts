import {
  NOTION_VERSION,
  type NotionBotUser,
  type NotionDataSource,
  type NotionList,
  type NotionPage,
} from '../../src/sources/notion/types';

/** Error carrying Notion's stable error `code` (e.g. `unauthorized`, `object_not_found`). */
export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

export interface NotionClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests. Notion allows ~3 req/s per connection. */
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const BASE = 'https://api.notion.com/v1';

/**
 * Minimal Notion REST client (no SDK dependency). Requests run through a
 * serial queue paced for the per-connection limit; 429/529 are retried after
 * `Retry-After`, idempotent 5xx with exponential backoff and jitter.
 */
export class NotionClient {
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  constructor(private readonly options: NotionClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 340;
    this.maxRetries = options.maxRetries ?? 5;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  request<T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string[]>): Promise<T> {
    const run = () => this.send<T>(method, path, body, query);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async send<T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string[]>): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, values] of Object.entries(query ?? {})) for (const v of values) url.searchParams.append(k, v);

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastStart + this.minIntervalMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = Date.now();

      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Notion-Version': NOTION_VERSION,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (res.ok) return (await res.json()) as T;

      const payload = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        additional_data?: { rate_limit_reason?: string };
      };
      // Search and query are read-only, so POST retries are safe for this client.
      const retryable =
        (res.status === 429 && payload.additional_data?.rate_limit_reason !== 'public_api_request_blocked') ||
        res.status === 529 ||
        [500, 502, 503, 504].includes(res.status);

      if (!retryable || attempt >= this.maxRetries) {
        throw new NotionApiError(res.status, payload.code ?? 'http_error', payload.message ?? `Notion returned HTTP ${res.status}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const delayS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(2 ** attempt, 30);
      await this.sleep(delayS * 1000 + Math.random() * 250);
    }
  }

  me() {
    return this.request<NotionBotUser>('GET', '/users/me');
  }

  /** Every data source shared with the connection (search returns full schemas). */
  async listDataSources(): Promise<NotionDataSource[]> {
    const out: NotionDataSource[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request<NotionList<NotionDataSource>>('POST', '/search', {
        filter: { property: 'object', value: 'data_source' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      out.push(...page.results.filter((d) => d.object === 'data_source' && !d.in_trash));
      cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out;
  }

  retrieveDataSource(id: string) {
    return this.request<NotionDataSource>('GET', `/data_sources/${encodeURIComponent(id)}`);
  }

  /** First page of rows only — used to infer formula/rollup result types. */
  async sampleRows(id: string, size = 25): Promise<NotionPage[]> {
    const res = await this.request<NotionList<NotionPage>>('POST', `/data_sources/${encodeURIComponent(id)}/query`, {
      page_size: size,
      result_type: 'page',
    });
    return res.results;
  }

  /**
   * Every row in a data source. A single query stops at 10,000 results
   * (`request_status: incomplete`), so rows are read in `created_time` windows
   * and de-duplicated by id, as Notion recommends.
   */
  async queryAllRows(id: string, opts: { filterProperties?: string[] } = {}): Promise<NotionPage[]> {
    const rows = new Map<string, NotionPage>();
    let windowStart: string | undefined;
    const query = opts.filterProperties ? { filter_properties: opts.filterProperties } : undefined;

    for (;;) {
      let incomplete = false;
      let lastCreated: string | undefined;
      let cursor: string | undefined;
      do {
        const res = await this.request<NotionList<NotionPage>>(
          'POST',
          `/data_sources/${encodeURIComponent(id)}/query`,
          {
            page_size: 100,
            result_type: 'page',
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
            ...(windowStart
              ? { filter: { timestamp: 'created_time', created_time: { on_or_after: windowStart } } }
              : {}),
            ...(cursor ? { start_cursor: cursor } : {}),
          },
          query,
        );
        if (res.request_status?.type === 'incomplete') incomplete = true;
        for (const p of res.results) {
          if (p.object !== 'page' || p.in_trash) continue;
          rows.set(p.id, p);
          lastCreated = p.created_time;
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);

      if (!incomplete || !lastCreated || lastCreated === windowStart) break;
      windowStart = lastCreated;
    }
    return [...rows.values()];
  }
}
