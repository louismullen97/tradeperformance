import type { FieldDefinition } from '../fields/types';
import type { SourceDataset, SourceProperty, SourceSchema } from '../source/types';
import { suggestMappings } from './suggest';
import type { MappingConfig, MappingEntry } from './types';

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `map_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Fresh config built entirely from automatic suggestions. */
export function createSuggestedConfig(
  dataset: SourceDataset,
  schema: SourceSchema,
  fields: readonly FieldDefinition[],
  target?: string,
): MappingConfig {
  const ts = nowIso();
  return {
    id: newId(),
    schemaVersion: 1,
    source: { kind: dataset.kind, datasetId: dataset.id, datasetName: dataset.name, ...(target && target !== 'trades' ? { target } : {}) },
    schemaFingerprint: schema.fingerprint,
    entries: suggestMappings(fields, schema.properties),
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Set (or clear) the property for one field. Always recorded as a manual choice. */
export function setFieldMapping(
  config: MappingConfig,
  fieldKey: string,
  property: SourceProperty | null,
): MappingConfig {
  const entry: MappingEntry = {
    fieldKey,
    propertyId: property?.id ?? null,
    propertyNameSnapshot: property?.name ?? null,
    origin: 'manual',
    confidence: null,
  };
  return { ...config, entries: { ...config.entries, [fieldKey]: entry }, updatedAt: nowIso() };
}

/** Accept an uncertain/auto suggestion as-is (marks it as user-confirmed). */
export function confirmFieldMapping(config: MappingConfig, fieldKey: string): MappingConfig {
  const entry = config.entries[fieldKey];
  if (!entry?.propertyId) return config;
  return {
    ...config,
    entries: { ...config.entries, [fieldKey]: { ...entry, origin: 'manual' } },
    updatedAt: nowIso(),
  };
}
