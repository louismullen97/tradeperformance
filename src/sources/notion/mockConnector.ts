import type { DataSourceConnector, SourceDataset, SourceRecord, SourceSchema } from '../../domain/source/types';
import { MOCK_DATABASES, type MockNotionDatabase } from './mock/databases';
import { translateDataset, translatePage, translateSchema } from './translate';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo connector serving Notion-API-shaped fixtures through the same
 * translator as the live connector. Used when no Notion token is configured.
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
    const db = this.databases.find((d) => d.dataSource.id === datasetId);
    if (!db) throw new Error(`Notion data source ${datasetId} not found or not shared with the connection.`);
    return db;
  }

  private livePages(db: MockNotionDatabase) {
    return db.pages.filter((p) => !p.in_trash);
  }

  async listDatasets(): Promise<SourceDataset[]> {
    await delay(this.latencyMs);
    return this.databases.map((d) => translateDataset(d.dataSource, this.livePages(d).length, this.workspace));
  }

  async getSchema(datasetId: string): Promise<SourceSchema> {
    await delay(this.latencyMs * 0.6);
    const db = this.find(datasetId);
    return translateSchema(db.dataSource, db.pages.slice(0, 25));
  }

  async fetchRecords(datasetId: string): Promise<SourceRecord[]> {
    await delay(this.latencyMs);
    return this.livePages(this.find(datasetId)).map(translatePage);
  }
}
