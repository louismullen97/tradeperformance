import type { SourceKind, SourceValue } from '../source/types';

/** Value types for the standardised trade model. */
export type TradeFieldValue = string | number | string[] | null;

/** Where an imported trade came from, so it can always be traced back. */
export interface TradeProvenance {
  kind: SourceKind;
  datasetId: string;
  datasetName: string;
  recordId: string;
  recordUrl?: string;
  recordLastEditedTime?: string;
  mappingConfigId: string;
  batchId: string;
  importedAt: string;
  /** Original values of every mapped property, keyed by source property name. */
  originalValues: Record<string, SourceValue>;
}

export interface StandardTrade {
  /** Deterministic id: `${kind}:${datasetId}:${recordId}` — re-imports upsert, not duplicate. */
  id: string;
  trade_date: string;
  currency_pair: string;
  setup: string;
  risk_percentage: number;
  result_r: number;
  profit_loss_percentage: number;
  /** Optional standardised fields (direction, timeframe, ...), keyed by field key. */
  optional: Record<string, TradeFieldValue>;
  source: TradeProvenance;
}

export function tradeId(kind: SourceKind, datasetId: string, recordId: string): string {
  return `${kind}:${datasetId}:${recordId}`;
}
