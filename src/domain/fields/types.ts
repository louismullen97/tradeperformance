/** The shape of value a standardised field holds once imported. */
export type FieldValueKind = 'date' | 'string' | 'number' | 'string_list' | 'file_list';

export type FieldGroup = 'core' | 'execution' | 'context' | 'meta';

export interface FieldDefinition {
  /** Stable, snake_case key used throughout the analytics engine. */
  key: string;
  label: string;
  description: string;
  required: boolean;
  valueKind: FieldValueKind;
  group: FieldGroup;
  /** Semantic unit; drives conversions such as Notion percent rescaling. */
  unit?: 'percent' | 'r_multiple' | 'price' | 'currency';
  /** Alternative names users commonly give this column. Used only for suggestions. */
  aliases: string[];
  /**
   * Optional canonical vocabulary. Keys are canonical values, arrays are accepted
   * synonyms (case-insensitive). Values outside the vocabulary are flagged.
   */
  vocabulary?: Record<string, string[]>;
  /** Plausible range; values outside it are flagged for attention, not rejected. */
  plausibleRange?: { min?: number; max?: number; exclusiveMin?: boolean };
  /** Value normalisation applied after coercion. */
  normalise?: 'instrument';
  example: string;
}
