import type { SourceRecord, SourceValue } from '../source/types';
import type { TradeFieldValue } from '../trades/types';

export type IssueCode =
  | 'empty_record'
  | 'missing_required'
  | 'invalid_required'
  | 'invalid_optional'
  | 'duplicate'
  | 'ambiguous_date'
  | 'out_of_range'
  | 'sign_mismatch';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  fieldKey?: string;
  message: string;
}

/**
 * valid     – ready to import
 * attention – importable, but the user should review (duplicates, odd values, ...)
 * excluded  – cannot be imported (incomplete or unreadable mandatory data)
 */
export type RecordStatus = 'valid' | 'attention' | 'excluded';

export interface CellResult {
  propertyId: string;
  propertyName: string;
  raw: SourceValue;
  rawDisplay: string;
  value: TradeFieldValue;
  converted: boolean;
  issue?: IssueCode;
}

export interface RecordValidation {
  record: SourceRecord;
  status: RecordStatus;
  /** Standardised values (null where missing or invalid). */
  values: Record<string, TradeFieldValue>;
  /** Per-field detail, including the original source value. */
  cells: Record<string, CellResult>;
  issues: ValidationIssue[];
  duplicateOfRecordId?: string;
}

export interface ValidationReport {
  datasetId: string;
  mappingConfigId: string;
  generatedAt: string;
  records: RecordValidation[];
  counts: { total: number; valid: number; attention: number; excluded: number };
  issueCounts: Partial<Record<IssueCode, number>>;
  /** Column-level observations, e.g. inferred date order or percent rescaling. */
  columnNotes: Record<string, string[]>;
  /**
   * Multi-select columns not mapped to any field. Trade imports keep them as
   * custom tag groups, so a column the user adds later flows through the app.
   */
  extraTagColumns?: { propertyId: string; name: string }[];
}

export const ISSUE_LABEL: Record<IssueCode, string> = {
  empty_record: 'Empty row',
  missing_required: 'Missing value',
  invalid_required: 'Invalid format',
  invalid_optional: 'Invalid optional value',
  duplicate: 'Possible duplicate',
  ambiguous_date: 'Ambiguous date',
  out_of_range: 'Unusual value',
  sign_mismatch: 'R / % mismatch',
};
