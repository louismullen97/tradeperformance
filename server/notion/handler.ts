import type { IncomingMessage, ServerResponse } from 'node:http';
import { NotionApiConnector } from './apiConnector';
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
 */

export interface NotionApiConfig {
  /** Server-side secret. Never sent to the browser. */
  token: string | undefined;
}

let cached: { token: string; connector: NotionApiConnector } | null = null;

function connectorFor(token: string) {
  if (cached?.token !== token) {
    cached = { token, connector: new NotionApiConnector(new NotionClient({ token })) };
  }
  return cached.connector;
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
    if (e.code === 'restricted_resource' || e.status === 403)
      return { status: 403, code: 'forbidden', message: `Notion refused access: ${e.message}` };
    if (e.status === 429 || e.status === 529)
      return { status: 503, code: 'rate_limited', message: 'Notion is rate limiting requests. Try again in a minute.' };
    return { status: 502, code: e.code, message: `Notion error: ${e.message}` };
  }
  return { status: 500, code: 'internal', message: e instanceof Error ? e.message : 'Unexpected error' };
}

const ROUTE = /^\/data-sources\/([0-9a-fA-F-]{32,36})\/(schema|records|count)$/;

export async function handleNotionApi(req: IncomingMessage, res: ServerResponse, config: NotionApiConfig): Promise<void> {
  if (req.method !== 'GET') return send(res, 405, { error: { code: 'method_not_allowed', message: 'GET only' } });
  const path = new URL(req.url ?? '/', 'http://local').pathname.replace(/\/+$/, '') || '/';

  if (!config.token) {
    if (path === '/status') return send(res, 200, { mode: 'unconfigured' });
    return send(res, 503, { error: { code: 'unconfigured', message: 'NOTION_TOKEN is not set on the server.' } });
  }
  const connector = connectorFor(config.token);

  try {
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
    const err = describeError(e);
    if (path === '/status') return send(res, 200, { mode: 'error', error: { code: err.code, message: err.message } });
    return send(res, err.status, { error: { code: err.code, message: err.message } });
  }
}
