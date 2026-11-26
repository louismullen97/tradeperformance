import type { DataSourceConnector, SourceDataset, SourceRecord, SourceSchema } from '../../domain/source/types';
import { MOCK_DATABASES, type MockNotionDatabase } from './mock/databases';
import { translateDataset, translatePage, translateSchema } from './translate';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock Notion connector. Serves Notion-API-shaped fixtures through the same
 * translator the real connector will use. A real implementation will replace
 * the fixture lookups with: search (filter: database) → retrieve database →
 * paginated query (100 pages per request, following `next_cursor`).
 */
export class MockNotionConnector implements DataSourceConnector {
  readonly kind = 'notion' as const;
  readonly label = 'Notion';

  constructor(
    private readonly databases: MockNotionDatabase[] = MOCK_DATABASES,
    private readonly latencyMs = 450,
    readonly workspace = 'Demo workspace',
  ) {}

  private find(datasetId: string) {
    const db = this.databases.find((d) => d.database.id === datasetId);
    if (!db) throw new Error(`Notion database ${datasetId} not found or not shared with the integration.`);
    return db;
  }

  async listDatasets(): Promise<SourceDataset[]> {
    await delay(this.latencyMs);
    return this.databases.map((d) =>
      translateDataset(d.database, d.pages.filter((p) => !p.archived).length, this.workspace),
    );
  }

  async getSchema(datasetId: string): Promise<SourceSchema> {
    await delay(this.latencyMs * 0.6);
    const db = this.find(datasetId);
    return translateSchema(db.database, db.pages.slice(0, 25));
  }

  async fetchRecords(datasetId: string): Promise<SourceRecord[]> {
    await delay(this.latencyMs);
    return this.find(datasetId).pages.filter((p) => !p.archived).map(translatePage);
  }
}
