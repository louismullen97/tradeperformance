import type { FieldDefinition } from '../fields/types';
import type { SourceSchema } from '../source/types';
import { normaliseName } from './matcher';
import { suggestMappings } from './suggest';
import type { MappingConfig, MappingEntry } from './types';

export type ReconcileChange =
  | { type: 'renamed'; fieldKey: string; from: string; to: string }
  | { type: 'relinked'; fieldKey: string; propertyName: string }
  | { type: 'removed'; fieldKey: string; propertyName: string }
  | { type: 'new_field'; fieldKey: string; suggested: string | null };

export interface ReconcileResult {
  config: MappingConfig;
  changes: ReconcileChange[];
  schemaChanged: boolean;
}

/**
 * Re-apply a saved mapping to the current schema of the same dataset (after a
 * reconnect or refresh). Entries are matched by property id first, then by the
 * saved name. Nothing is silently dropped: every adjustment is reported.
 * Fields added to the registry since the config was saved receive suggestions.
 */
export function reconcileMapping(
  saved: MappingConfig,
  schema: SourceSchema,
  fields: readonly FieldDefinition[],
): ReconcileResult {
  const byId = new Map(schema.properties.map((p) => [p.id, p]));
  const byName = new Map(schema.properties.map((p) => [normaliseName(p.name), p]));
  const changes: ReconcileChange[] = [];
  const entries: Record<string, MappingEntry> = {};

  for (const field of fields) {
    const entry = saved.entries[field.key];
    if (!entry) continue; // handled as a new field below
    if (!entry.propertyId) {
      entries[field.key] = { ...entry, origin: entry.origin === 'auto' ? 'auto' : 'restored' };
      continue;
    }
    const byIdMatch = byId.get(entry.propertyId);
    if (byIdMatch) {
      if (entry.propertyNameSnapshot && byIdMatch.name !== entry.propertyNameSnapshot) {
        changes.push({ type: 'renamed', fieldKey: field.key, from: entry.propertyNameSnapshot, to: byIdMatch.name });
      }
      entries[field.key] = { ...entry, propertyNameSnapshot: byIdMatch.name, origin: 'restored' };
      continue;
    }
    const byNameMatch = entry.propertyNameSnapshot
      ? byName.get(normaliseName(entry.propertyNameSnapshot))
      : undefined;
    if (byNameMatch) {
      changes.push({ type: 'relinked', fieldKey: field.key, propertyName: byNameMatch.name });
      entries[field.key] = { ...entry, propertyId: byNameMatch.id, propertyNameSnapshot: byNameMatch.name, origin: 'restored' };
      continue;
    }
    // Keep the dangling reference so the UI can show it as "stale" rather than hide it.
    changes.push({ type: 'removed', fieldKey: field.key, propertyName: entry.propertyNameSnapshot ?? 'Unknown' });
    entries[field.key] = { ...entry, origin: 'restored' };
  }

  const newFieldKeys = fields.filter((f) => !saved.entries[f.key]).map((f) => f.key);
  if (newFieldKeys.length) {
    const reserved = Object.values(entries)
      .map((e) => e.propertyId)
      .filter((id): id is string => !!id && byId.has(id));
    const suggestions = suggestMappings(fields, schema.properties, {
      onlyFields: newFieldKeys,
      reservedPropertyIds: reserved,
    });
    for (const key of newFieldKeys) {
      entries[key] = suggestions[key];
      changes.push({ type: 'new_field', fieldKey: key, suggested: suggestions[key].propertyNameSnapshot });
    }
  }

  return {
    config: {
      ...saved,
      entries,
      schemaFingerprint: schema.fingerprint,
      updatedAt: new Date().toISOString(),
    },
    changes,
    schemaChanged: saved.schemaFingerprint !== schema.fingerprint,
  };
}
