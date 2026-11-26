import type { SourceKind } from '../source/types';

export type MappingOrigin = 'auto' | 'manual' | 'restored';

export interface MappingEntry {
  fieldKey: string;
  /** Source property id, or null when the field is intentionally left unmapped. */
  propertyId: string | null;
  /** Property name at the time of mapping; used to re-link if ids ever change. */
  propertyNameSnapshot: string | null;
  origin: MappingOrigin;
  /** Matcher confidence 0–1 for automatic suggestions; null for manual choices. */
  confidence: number | null;
}

/**
 * Persistable mapping between a source dataset and the standardised fields.
 * Contains no source data — only references — so it can be saved and re-applied
 * when the user reconnects or refreshes their database.
 */
export interface MappingConfig {
  id: string;
  schemaVersion: 1;
  source: { kind: SourceKind; datasetId: string; datasetName: string };
  schemaFingerprint: string;
  entries: Record<string, MappingEntry>;
  createdAt: string;
  updatedAt: string;
}

export type Compatibility = 'native' | 'convertible' | 'incompatible';

export type MappingStatus =
  | 'auto_matched'
  | 'uncertain'
  | 'manual'
  | 'restored'
  | 'missing'
  | 'unmapped'
  | 'conflict'
  | 'incompatible'
  | 'stale';

export interface FieldMappingState {
  fieldKey: string;
  status: MappingStatus;
  compatibility: Compatibility | null;
  /** True when this state prevents continuing to validation. */
  blocking: boolean;
  messages: string[];
}

export interface MappingEvaluation {
  fields: Record<string, FieldMappingState>;
  summary: {
    autoMatched: number;
    uncertain: number;
    manual: number;
    missing: number;
    blocking: number;
    mandatoryMapped: number;
    mandatoryTotal: number;
    optionalMapped: number;
    optionalTotal: number;
  };
  canProceed: boolean;
}
