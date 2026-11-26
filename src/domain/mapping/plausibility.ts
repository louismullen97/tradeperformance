import type { FieldDefinition } from '../fields/types';
import type { SourceProperty, SourceRecord } from '../source/types';
import { coerceValue } from '../validation/coerce';

/**
 * Looks at a column's actual values and warns when most of them fall outside
 * the field's plausible range — e.g. a currency P/L column (750, -250) mapped
 * to a percentage field. Advisory only; it never blocks a mapping.
 */
export function plausibilityWarning(
  field: FieldDefinition,
  property: SourceProperty,
  records: SourceRecord[],
): string | null {
  const range = field.plausibleRange;
  if (field.valueKind !== 'number' || !range) return null;

  const numbers: number[] = [];
  for (const r of records) {
    const res = coerceValue(r.values[property.id], property, field);
    if (res.status === 'ok' && typeof res.value === 'number') numbers.push(res.value);
  }
  if (numbers.length < 3) return null;

  const outside = numbers.filter(
    (n) => (range.max !== undefined && n > range.max) || (range.min !== undefined && !range.exclusiveMin && n < range.min),
  );
  if (outside.length / numbers.length < 0.5) return null;

  const example = outside[0];
  if (field.unit === 'percent')
    return `Values like ${example} look like amounts, not percentages. If this column is money, map it to P/L (amount) instead.`;
  return `Most values (e.g. ${example}) are outside the usual range for ${field.label}. Check this is the right column.`;
}
