import type { ImportResult, ImportTarget } from '../import/targets';
import type { MappingConfigRepository } from '../mapping/repository';
import { reconcileMapping } from '../mapping/reconcile';
import { evaluateMapping } from '../mapping/evaluate';
import type { DataSourceConnector, SourceDataset, SourceSchema } from '../source/types';
import { validateRecords } from '../validation/validate';
import { detectRoles, type CentreRole, type Detection } from './detect';
import { saveCentre, type CentreSettings } from './settings';

export type SyncOutcome = { status: 'synced'; result: ImportResult } | { status: 'linked' } | { status: 'needs_mapping'; message: string } | { status: 'error'; message: string };

/** Read every shared database's schema and work out its role. */
export async function detectCentre(connector: DataSourceConnector, targets: ImportTarget[]): Promise<Detection[]> {
  const datasets = await connector.listDatasets();
  const inputs: { dataset: SourceDataset; schema: SourceSchema }[] = [];
  for (const dataset of datasets) inputs.push({ dataset, schema: await connector.getSchema(dataset.id) });
  const fields = Object.fromEntries(targets.map((t) => [t.key, t.fields])) as Parameters<typeof detectRoles>[1];
  return detectRoles(inputs, fields);
}

/**
 * Import every recognised database. Saved mappings (from the wizard or an
 * earlier sync) take priority over fresh suggestions, so manual fixes stick.
 */
export async function syncCentre(
  detections: Detection[],
  services: { connector: DataSourceConnector; mappings: MappingConfigRepository; targets: ImportTarget[] },
  onProgress?: (datasetId: string, outcome: SyncOutcome | 'syncing') => void,
): Promise<Record<string, SyncOutcome>> {
  const out: Record<string, SyncOutcome> = {};
  const roles: CentreSettings['roles'] = {};
  for (const d of detections) {
    if (!d.role) continue;
    roles[d.role] = [...(roles[d.role] ?? []), d.dataset.id];
    if (d.role === 'reviews') {
      out[d.dataset.id] = { status: 'linked' };
      onProgress?.(d.dataset.id, out[d.dataset.id]);
      continue;
    }
    const target = services.targets.find((t) => t.key === d.role);
    if (!target) continue;
    onProgress?.(d.dataset.id, 'syncing');
    try {
      const saved = await services.mappings.find(d.dataset.kind, d.dataset.id, d.role);
      const config = saved ? reconcileMapping(saved, d.schema, target.fields).config : d.candidate!.config!;
      if (!evaluateMapping(config, d.schema.properties, target.fields).canProceed) {
        out[d.dataset.id] = { status: 'needs_mapping', message: 'Some required fields need matching — open it in the import wizard.' };
      } else {
        const records = await services.connector.fetchRecords(d.dataset.id);
        const report = validateRecords(records, d.schema.properties, config, target.fields);
        const result = await target.commit(report, {}, d.dataset, config);
        await services.mappings.save(config);
        out[d.dataset.id] = { status: 'synced', result };
      }
    } catch (e) {
      out[d.dataset.id] = { status: 'error', message: e instanceof Error ? e.message : 'Sync failed.' };
    }
    onProgress?.(d.dataset.id, out[d.dataset.id]);
  }
  saveCentre({ roles: roles as Partial<Record<CentreRole, string[]>>, lastSync: new Date().toISOString() });
  return out;
}
