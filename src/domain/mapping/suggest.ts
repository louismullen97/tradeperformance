import type { FieldDefinition } from '../fields/types';
import type { SourceProperty } from '../source/types';
import { compatibilityOf } from './compatibility';
import { bestNameMatch } from './matcher';
import type { Compatibility, MappingEntry } from './types';

/** Minimum combined score for a property to be suggested at all. */
export const SUGGEST_THRESHOLD = 0.55;
/** Minimum score (with native type) for a suggestion to count as a confident match. */
export const CONFIDENT_THRESHOLD = 0.85;

const TYPE_WEIGHT: Record<Compatibility, number> = { native: 1, convertible: 0.8, incompatible: 0 };

/**
 * How well a number column's display format fits the field's unit. A Notion
 * percent-format column is strong evidence for a percentage field and against
 * an R or money field; a currency column is evidence against percentages.
 * Plain numbers are ambiguous, so they keep percent matches in "review".
 */
export function unitAffinity(field: FieldDefinition, property: SourceProperty): number {
  if (property.type !== 'number' || !field.unit) return 1;
  const fmt = property.numberFormat ?? 'number';
  switch (field.unit) {
    case 'percent':
      return fmt === 'percent' ? 1 : fmt === 'currency' ? 0.3 : 0.84;
    case 'r_multiple':
      return fmt === 'number' ? 1 : 0.4;
    case 'currency':
      return fmt === 'percent' ? 0.3 : 1;
    default:
      return fmt === 'percent' ? 0.5 : 1;
  }
}

export interface Candidate {
  property: SourceProperty;
  compatibility: Compatibility;
  nameScore: number;
  score: number;
  matchedAlias: string;
}

/** Every property scored against a field, best first. Used for suggestions and dropdown ordering. */
export function rankCandidates(field: FieldDefinition, properties: SourceProperty[]): Candidate[] {
  return properties
    .map((property) => {
      const compatibility = compatibilityOf(field.valueKind, property.type);
      const { score: nameScore, matchedAlias } = bestNameMatch(property.name, field);
      return {
        property,
        compatibility,
        nameScore,
        matchedAlias,
        score: nameScore * TYPE_WEIGHT[compatibility] * unitAffinity(field, property),
      };
    })
    .sort((a, b) => b.score - a.score || a.property.name.localeCompare(b.property.name));
}

export interface SuggestOptions {
  /** Limit suggestions to these fields (others are left out of the result). */
  onlyFields?: string[];
  /** Property ids already in use that must not be suggested again. */
  reservedPropertyIds?: Iterable<string>;
}

/**
 * Propose a mapping for each field. Assignment is global and greedy: the
 * strongest (field, property) pairs are taken first and each property is
 * suggested at most once, so "Risk %" won't be offered to two fields.
 */
export function suggestMappings(
  fields: readonly FieldDefinition[],
  properties: SourceProperty[],
  options: SuggestOptions = {},
): Record<string, MappingEntry> {
  const targetFields = options.onlyFields
    ? fields.filter((f) => options.onlyFields!.includes(f.key))
    : fields;

  const pairs: { field: FieldDefinition; candidate: Candidate }[] = [];
  for (const field of targetFields) {
    for (const candidate of rankCandidates(field, properties)) {
      if (candidate.score >= SUGGEST_THRESHOLD) pairs.push({ field, candidate });
    }
  }
  pairs.sort(
    (a, b) =>
      b.candidate.score - a.candidate.score ||
      Number(b.field.required) - Number(a.field.required),
  );

  const usedProperties = new Set<string>(options.reservedPropertyIds ?? []);
  const result: Record<string, MappingEntry> = {};
  for (const { field, candidate } of pairs) {
    if (result[field.key] || usedProperties.has(candidate.property.id)) continue;
    usedProperties.add(candidate.property.id);
    result[field.key] = {
      fieldKey: field.key,
      propertyId: candidate.property.id,
      propertyNameSnapshot: candidate.property.name,
      origin: 'auto',
      confidence: Math.round(candidate.score * 100) / 100,
    };
  }
  for (const field of targetFields) {
    result[field.key] ??= {
      fieldKey: field.key,
      propertyId: null,
      propertyNameSnapshot: null,
      origin: 'auto',
      confidence: null,
    };
  }
  return result;
}
