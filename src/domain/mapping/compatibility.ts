import type { FieldValueKind } from '../fields/types';
import type { SourcePropertyType } from '../source/types';
import type { Compatibility } from './types';

/**
 * Which source property types can feed which field value kinds.
 *   native       – used as-is
 *   convertible  – can be parsed safely; each value is validated, failures are flagged
 *   incompatible – cannot be selected
 */
const MATRIX: Record<FieldValueKind, Partial<Record<SourcePropertyType, Compatibility>>> = {
  date: { date: 'native', text: 'convertible', title: 'convertible' },
  string: {
    select: 'native',
    text: 'native',
    title: 'native',
    multi_select: 'convertible',
    number: 'convertible',
    date: 'convertible',
    url: 'convertible',
  },
  number: { number: 'native', text: 'convertible', title: 'convertible', select: 'convertible' },
  string_list: { multi_select: 'native', select: 'convertible', text: 'convertible' },
  file_list: { files: 'native', url: 'convertible', text: 'convertible' },
};

export function compatibilityOf(valueKind: FieldValueKind, propertyType: SourcePropertyType): Compatibility {
  return MATRIX[valueKind][propertyType] ?? 'incompatible';
}

export const VALUE_KIND_LABEL: Record<FieldValueKind, string> = {
  date: 'Date',
  string: 'Text / Select',
  number: 'Number',
  string_list: 'List',
  file_list: 'Files',
};
