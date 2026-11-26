import type {
  DataSourceConnector,
  SourceDataset,
  SourceKind,
  SourceRecord,
  SourceSchema,
} from '../../domain/source/types';

export interface ConnectionStatus {
  mode: 'live' | 'unconfigured' | 'error';
  workspace?: string;
  error?: { code: string; message: string };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Request failed (HTTP ${res.status}).`);
  }
  return body as T;
}

/**
 * Browser-side connector that talks to our own backend (`/api/<kind>`), which
 * holds the provider credentials. Works for any source the backend exposes.
 */
export class HttpConnector implements DataSourceConnector {
  constructor(
    readonly kind: SourceKind,
    readonly label: string,
    private readonly baseUrl: string,
  ) {}

  static status(baseUrl: string): Promise<ConnectionStatus> {
    return getJson<ConnectionStatus>(`${baseUrl}/status`);
  }

  listDatasets() {
    return getJson<SourceDataset[]>(`${this.baseUrl}/data-sources`);
  }

  getSchema(datasetId: string) {
    return getJson<SourceSchema>(`${this.baseUrl}/data-sources/${encodeURIComponent(datasetId)}/schema`);
  }

  fetchRecords(datasetId: string) {
    return getJson<SourceRecord[]>(`${this.baseUrl}/data-sources/${encodeURIComponent(datasetId)}/records`);
  }

  async countRecords(datasetId: string) {
    const { count } = await getJson<{ count: number }>(`${this.baseUrl}/data-sources/${encodeURIComponent(datasetId)}/count`);
    return count;
  }
}
