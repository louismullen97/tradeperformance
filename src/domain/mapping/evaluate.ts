import type { FieldDefinition } from '../fields/types';
import type { SourceProperty } from '../source/types';
import { compatibilityOf } from './compatibility';
import { CONFIDENT_THRESHOLD } from './suggest';
import type { FieldMappingState, MappingConfig, MappingEvaluation, MappingStatus } from './types';

/**
 * Derive a status for every field from the current mapping config and source
 * schema. Pure function: the UI re-runs it on every change.
 */
export function evaluateMapping(
  config: MappingConfig,
  properties: SourceProperty[],
  fields: readonly FieldDefinition[],
): MappingEvaluation {
  const byId = new Map(properties.map((p) => [p.id, p]));

  // Which fields use each property — needed for conflict detection.
  const usage = new Map<string, FieldDefinition[]>();
  for (const field of fields) {
    const pid = config.entries[field.key]?.propertyId;
    if (!pid) continue;
    usage.set(pid, [...(usage.get(pid) ?? []), field]);
  }

  const states: Record<string, FieldMappingState> = {};
  for (const field of fields) {
    const entry = config.entries[field.key];
    const messages: string[] = [];
    let status: MappingStatus;
    let compatibility: FieldMappingState['compatibility'] = null;

    if (!entry?.propertyId) {
      status = field.required ? 'missing' : 'unmapped';
      if (field.required) messages.push('Mandatory field — select a source property.');
    } else {
      const property = byId.get(entry.propertyId);
      if (!property) {
        status = 'stale';
        messages.push(
          `“${entry.propertyNameSnapshot ?? 'Unknown'}” no longer exists in this database.`,
        );
      } else {
        compatibility = compatibilityOf(field.valueKind, property.type);
        const sharedWith = (usage.get(property.id) ?? []).filter((f) => f.key !== field.key);
        const conflicting = sharedWith.filter((f) => f.valueKind !== field.valueKind);

        if (compatibility === 'incompatible') {
          status = 'incompatible';
          messages.push(`A ${property.nativeType} property can't be used as ${field.label}.`);
        } else if (conflicting.length) {
          status = 'conflict';
          messages.push(
            `“${property.name}” is also mapped to ${conflicting.map((f) => f.label).join(', ')}, which expects a different type.`,
          );
        } else {
          if (entry.origin === 'manual') status = 'manual';
          else if (entry.origin === 'restored') status = 'restored';
          else if ((entry.confidence ?? 0) >= CONFIDENT_THRESHOLD && compatibility === 'native')
            status = 'auto_matched';
          else status = 'uncertain';

          if (compatibility === 'convertible')
            messages.push(`Values will be converted from ${property.nativeType}; each one is checked.`);
          if (sharedWith.length)
            messages.push(`Shared with ${sharedWith.map((f) => f.label).join(', ')}.`);
          if (status === 'uncertain' && compatibility === 'native')
            messages.push('Partial name match — please confirm.');
        }
      }
    }

    const blocking =
      status === 'incompatible' ||
      status === 'conflict' ||
      (field.required && (status === 'missing' || status === 'stale'));

    states[field.key] = { fieldKey: field.key, status, compatibility, blocking, messages };
  }

  const list = Object.values(states);
  const mandatory = fields.filter((f) => f.required);
  const optional = fields.filter((f) => !f.required);
  const isMapped = (k: string) => !['missing', 'unmapped', 'stale'].includes(states[k].status);

  return {
    fields: states,
    summary: {
      autoMatched: list.filter((s) => s.status === 'auto_matched' || s.status === 'restored').length,
      uncertain: list.filter((s) => s.status === 'uncertain').length,
      manual: list.filter((s) => s.status === 'manual').length,
      missing: list.filter((s) => s.status === 'missing' || s.status === 'stale').length,
      blocking: list.filter((s) => s.blocking).length,
      mandatoryMapped: mandatory.filter((f) => isMapped(f.key)).length,
      mandatoryTotal: mandatory.length,
      optionalMapped: optional.filter((f) => isMapped(f.key)).length,
      optionalTotal: optional.length,
    },
    canProceed: list.every((s) => !s.blocking),
  };
}
