import type { FieldDefinition } from '../fields/types';
import type { MappingConfig } from '../mapping/types';
import type { SourceDataset, SourceValue } from '../source/types';
import type { StandardTrade } from '../trades/types';
import { tradeId } from '../trades/types';
import type { RecordStatus, RecordValidation, ValidationReport } from '../validation/types';

export type RecordDecision = 'include' | 'exclude';

/**
 * Defaults: valid → include; attention → include, except suspected duplicates;
 * excluded → exclude (cannot be overridden — mandatory data is unusable).
 */
export function defaultDecision(r: RecordValidation): RecordDecision {
  if (r.status === 'valid') return 'include';
  if (r.status === 'attention') return r.duplicateOfRecordId ? 'exclude' : 'include';
  return 'exclude';
}

export function canInclude(r: RecordValidation): boolean {
  return r.status !== 'excluded';
}

export interface SkippedRecord {
  recordId: string;
  recordUrl?: string;
  status: RecordStatus;
  reason: 'invalid' | 'user_excluded';
  issues: string[];
}

export interface ImportBatch {
  id: string;
  createdAt: string;
  source: { kind: SourceDataset['kind']; datasetId: string; datasetName: string };
  mappingConfigId: string;
  trades: StandardTrade[];
  skipped: SkippedRecord[];
  counts: { imported: number; skippedInvalid: number; skippedByUser: number; total: number };
}

/** Turn a validation report + user decisions into standardised trades. Pure. */
export function buildImportBatch(
  report: ValidationReport,
  decisions: Record<string, RecordDecision>,
  dataset: SourceDataset,
  config: MappingConfig,
  fields: readonly FieldDefinition[],
): ImportBatch {
  const createdAt = new Date().toISOString();
  const batchId = `imp_${Date.now().toString(36)}`;
  const trades: StandardTrade[] = [];
  const skipped: SkippedRecord[] = [];
  const optionalKeys = fields.filter((f) => !f.required).map((f) => f.key);

  for (const r of report.records) {
    const decision = canInclude(r) ? (decisions[r.record.id] ?? defaultDecision(r)) : 'exclude';
    if (decision === 'exclude') {
      skipped.push({
        recordId: r.record.id,
        recordUrl: r.record.url,
        status: r.status,
        reason: canInclude(r) ? 'user_excluded' : 'invalid',
        issues: r.issues.map((i) => i.message),
      });
      continue;
    }

    const originalValues: Record<string, SourceValue> = {};
    for (const cell of Object.values(r.cells)) originalValues[cell.propertyName] = cell.raw;

    const v = r.values;
    trades.push({
      id: tradeId(dataset.kind, dataset.id, r.record.id),
      trade_date: v.trade_date as string,
      currency_pair: v.currency_pair as string,
      setup: v.setup as string,
      risk_percentage: v.risk_percentage as number,
      result_r: v.result_r as number,
      profit_loss_percentage: v.profit_loss_percentage as number,
      optional: Object.fromEntries(optionalKeys.filter((k) => k in v).map((k) => [k, v[k]])),
      source: {
        kind: dataset.kind,
        datasetId: dataset.id,
        datasetName: dataset.name,
        recordId: r.record.id,
        recordUrl: r.record.url,
        recordLastEditedTime: r.record.lastEditedTime,
        mappingConfigId: config.id,
        batchId,
        importedAt: createdAt,
        originalValues,
      },
    });
  }

  return {
    id: batchId,
    createdAt,
    source: { kind: dataset.kind, datasetId: dataset.id, datasetName: dataset.name },
    mappingConfigId: config.id,
    trades,
    skipped,
    counts: {
      imported: trades.length,
      skippedInvalid: skipped.filter((s) => s.reason === 'invalid').length,
      skippedByUser: skipped.filter((s) => s.reason === 'user_excluded').length,
      total: report.records.length,
    },
  };
}

/** Destination for standardised trades. In-memory for now; an API client later. */
export interface TradeRepository {
  upsertMany(trades: StandardTrade[]): Promise<{ inserted: number; updated: number }>;
  count(): Promise<number>;
}

export class InMemoryTradeRepository implements TradeRepository {
  private readonly trades = new Map<string, StandardTrade>();
  async upsertMany(trades: StandardTrade[]) {
    let inserted = 0;
    let updated = 0;
    for (const t of trades) {
      if (this.trades.has(t.id)) updated++;
      else inserted++;
      this.trades.set(t.id, t);
    }
    return { inserted, updated };
  }
  async count() {
    return this.trades.size;
  }
}
