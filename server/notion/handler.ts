import type { IncomingMessage, ServerResponse } from 'node:http';
import { NotionApiConnector } from './apiConnector';
import { createAsrPage, type CreateAsrRequest } from './asr';
import { NotionApiError, NotionClient } from './client';

/**
 * `/api/notion/*` routes. Framework-agnostic (plain Node req/res) so it can be
 * mounted in the Vite dev server today and in a production backend later.
 *
 *   GET /status                      → { mode: 'live' | 'unconfigured' | 'error', workspace?, error? }
 *   GET /data-sources                → SourceDataset[]
 *   GET /data-sources/:id/schema     → SourceSchema
 *   GET /data-sources/:id/records    → SourceRecord[]
 *   GET /data-sources/:id/count      → { count }
 *   POST /reviews                    → { id, url }  (creates an ASR page; needs Insert content)
 */

export interface NotionApiConfig {
  /** Server-side secret. Never sent to the browser. */
  token: string | undefined;
}

let cached: { token: string; client: NotionClient; connector: NotionApiConnector } | null = null;

function connectorFor(token: string) {
  if (cached?.token !== token) {
    const client = new NotionClient({ token });
    cached = { token, client, connector: new NotionApiConnector(client) };
  }
  return cached;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function describeError(e: unknown): { status: number; code: string; message: string } {
  if (e instanceof NotionApiError) {
    if (e.status === 401)
      return { status: 401, code: 'unauthorized', message: 'Notion rejected the API token. Check NOTION_TOKEN or create a new token.' };
    if (e.code === 'object_not_found')
      return {
        status: 404,
        code: 'not_shared',
        message: 'This database is not shared with the Tradelens connection. Add it under Content access in the Notion Developer portal.',
      };
    if (e.code === 'restricted_resource' && /insert|update|capabilit/i.test(e.message))
      return {
        status: 403,
        code: 'no_write_access',
        message: 'The Tradelens connection can only read. In the Notion Developer portal, open the connection → Capabilities → enable "Insert content", then try again.',
      };
    if (e.code === 'restricted_resource' || e.status === 403)
      return { status: 403, code: 'forbidden', message: `Notion refused access: ${e.message}` };
    if (e.status === 429 || e.status === 529)
      return { status: 503, code: 'rate_limited', message: 'Notion is rate limiting requests. Try again in a minute.' };
    return { status: 502, code: e.code, message: `Notion error: ${e.message}` };
  }
  return { status: 500, code: 'internal', message: e instanceof Error ? e.message : 'Unexpected error' };
}

const ROUTE = /^\/data-sources\/([0-9a-fA-F-]{32,36})\/(schema|records|count)$/;

const MAX_BODY = 20 * 1024 * 1024;

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function isAsrRequest(b: unknown): b is CreateAsrRequest {
  const r = b as CreateAsrRequest;
  return !!r && typeof r.dataSourceId === 'string' && /^[0-9a-fA-F-]{32,36}$/.test(r.dataSourceId) && !!r.document && Array.isArray(r.document.blocks) && Array.isArray(r.images);
}

export async function handleNotionApi(req: IncomingMessage, res: ServerResponse, config: NotionApiConfig): Promise<void> {
  const path = new URL(req.url ?? '/', 'http://local').pathname.replace(/\/+$/, '') || '/';
  const isWrite = req.method === 'POST' && path === '/reviews';
  if (req.method !== 'GET' && !isWrite) return send(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });

  if (!config.token) {
    if (path === '/status') return send(res, 200, { mode: 'unconfigured' });
    return send(res, 503, { error: { code: 'unconfigured', message: 'NOTION_TOKEN is not set on the server.' } });
  }
  const { connector, client } = connectorFor(config.token);

  try {
    if (isWrite) {
      const body = await readJson<unknown>(req);
      if (!isAsrRequest(body)) return send(res, 400, { error: { code: 'bad_request', message: 'Expected { dataSourceId, document, images }.' } });
      return send(res, 201, await createAsrPage(client, body));
    }
    if (path === '/status') {
      return send(res, 200, { mode: 'live', workspace: await connector.workspaceName() });
    }
    if (path === '/data-sources') return send(res, 200, await connector.listDatasets());

    const m = ROUTE.exec(path);
    if (m) {
      const [, id, action] = m;
      if (action === 'schema') return send(res, 200, await connector.getSchema(id));
      if (action === 'records') return send(res, 200, await connector.fetchRecords(id));
      return send(res, 200, { count: await connector.countRecords(id) });
    }
    return send(res, 404, { error: { code: 'not_found', message: `No route ${path}` } });
  } catch (e) {
    let err = describeError(e);
    if (isWrite && err.code === 'forbidden')
      err = {
        status: 403,
        code: 'no_write_access',
        message: 'Notion refused to create the page. In the Notion Developer portal, open the Tradelens connection → Capabilities → enable "Insert content", then try again.',
      };
    if (path === '/status') return send(res, 200, { mode: 'error', error: { code: err.code, message: err.message } });
    return send(res, err.status, { error: { code: err.code, message: err.message } });
  }
}
