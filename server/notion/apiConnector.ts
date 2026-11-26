import type { DataSourceConnector, SourceDataset, SourceRecord, SourceSchema } from '../../src/domain/source/types';
import { translateDataset, translatePage, translateSchema } from '../../src/sources/notion/translate';
import type { NotionClient } from './client';

/**
 * Live Notion connector (server-side only — it holds the token). Produces the
 * same domain types as the mock connector; the browser reaches it through the
 * `/api/notion` HTTP handler.
 */
export class NotionApiConnector implements DataSourceConnector {
  readonly kind = 'notion' as const;
  readonly label = 'Notion';
  private workspace: string | null = null;

  constructor(private readonly client: NotionClient) {}

  async workspaceName(): Promise<string> {
    if (this.workspace === null) {
      const me = await this.client.me();
      this.workspace = me.bot?.workspace_name || me.name || 'Notion workspace';
    }
    return this.workspace;
  }

  async listDatasets(): Promise<SourceDataset[]> {
    const [sources, workspace] = await Promise.all([this.client.listDataSources(), this.workspaceName()]);
    // Notion has no count endpoint — counts are loaded separately via countRecords.
    return sources.map((ds) => translateDataset(ds, null, workspace));
  }

  async getSchema(datasetId: string): Promise<SourceSchema> {
    const [ds, samples] = await Promise.all([
      this.client.retrieveDataSource(datasetId),
      this.client.sampleRows(datasetId),
    ]);
    return translateSchema(ds, samples);
  }

  async fetchRecords(datasetId: string): Promise<SourceRecord[]> {
    return (await this.client.queryAllRows(datasetId)).map(translatePage);
  }

  async countRecords(datasetId: string): Promise<number> {
    // Only the title property is returned, keeping the count cheap.
    return (await this.client.queryAllRows(datasetId, { filterProperties: ['title'] })).length;
  }
}
