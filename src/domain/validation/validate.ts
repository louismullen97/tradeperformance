import type { FieldDefinition } from '../fields/types';
import { compatibilityOf } from '../mapping/compatibility';
import type { MappingConfig } from '../mapping/types';
import type { SourceProperty, SourceRecord } from '../source/types';
import { displaySourceValue } from '../source/types';
import type { TradeFieldValue } from '../trades/types';
import { coerceValue, inferDateOrder, type ColumnHints } from './coerce';
import type {
  CellResult,
  IssueCode,
  RecordStatus,
  RecordValidation,
  ValidationIssue,
  ValidationReport,
} from './types';

interface ResolvedColumn {
  field: FieldDefinition;
  property: SourceProperty;
  hints: ColumnHints;
}

const DUPLICATE_KEY_FIELDS = [
  'trade_date',
  'currency_pair',
  'setup',
  'risk_percentage',
  'result_r',
  'profit_loss_percentage',
];

function resolveColumns(
  config: MappingConfig,
  properties: SourceProperty[],
  fields: readonly FieldDefinition[],
  records: SourceRecord[],
  notes: Record<string, string[]>,
): ResolvedColumn[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const columns: ResolvedColumn[] = [];
  for (const field of fields) {
    const pid = config.entries[field.key]?.propertyId;
    const property = pid ? byId.get(pid) : undefined;
    if (!property) continue;
    const hints: ColumnHints = {};
    const fieldNotes: string[] = [];

    if (field.valueKind === 'date' && property.type !== 'date') {
      const texts = records
        .map((r) => r.values[property.id])
        .flatMap((v) => (v?.kind === 'text' ? [v.text] : []));
      const { order, ambiguous } = inferDateOrder(texts);
      hints.dateOrder = order;
      hints.dateOrderAmbiguous = ambiguous;
      fieldNotes.push(
        ambiguous
          ? 'Text dates could be day-first or month-first; assumed DD/MM/YYYY. Ambiguous rows are flagged.'
          : `Text dates read as ${order === 'DMY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}.`,
      );
    }
    if (compatibilityOf(field.valueKind, property.type) === 'convertible' && field.valueKind !== 'date') {
      fieldNotes.push(`“${property.name}” is ${property.nativeType}; each value is parsed as ${field.valueKind === 'number' ? 'a number' : 'text'}.`);
    }
    if (field.unit === 'percent' && property.numberFormat === 'percent') {
      fieldNotes.push('Notion percent format detected — stored fractions converted to percentages (0.015 → 1.5).');
    }
    if (notes && fieldNotes.length) notes[field.key] = fieldNotes;
    columns.push({ field, property, hints });
  }
  return columns;
}

function checkRange(field: FieldDefinition, n: number): string | null {
  const r = field.plausibleRange;
  if (!r) return null;
  if (r.min !== undefined && (r.exclusiveMin ? n <= r.min : n < r.min))
    return `${field.label} of ${n} is ${r.exclusiveMin ? 'at or ' : ''}below the expected minimum (${r.min}).`;
  if (r.max !== undefined && n > r.max) return `${field.label} of ${n} is above the expected maximum (${r.max}).`;
  return null;
}

/**
 * Validate every source record against the mapping. Each record is returned —
 * none are discarded — with a status, standardised values, issues and the
 * original source values for traceability.
 */
export function validateRecords(
  records: SourceRecord[],
  properties: SourceProperty[],
  config: MappingConfig,
  fields: readonly FieldDefinition[],
): ValidationReport {
  const columnNotes: Record<string, string[]> = {};
  const columns = resolveColumns(config, properties, fields, records, columnNotes);
  // Defensive: the engine must not rely on the UI to enforce mandatory mappings.
  const unmappedRequired = fields.filter((f) => f.required && !columns.some((c) => c.field.key === f.key));
  const results: RecordValidation[] = [];

  for (const record of records) {
    const issues: ValidationIssue[] = [];
    const values: Record<string, TradeFieldValue> = {};
    const cells: Record<string, CellResult> = {};
    let anyValue = false;

    for (const { field, property, hints } of columns) {
      const raw = record.values[property.id] ?? { kind: 'empty' as const };
      const result = coerceValue(raw, property, field, hints);
      const cell: CellResult = {
        propertyId: property.id,
        propertyName: property.name,
        raw,
        rawDisplay: displaySourceValue(raw),
        value: null,
        converted: false,
      };

      if (result.status === 'ok') {
        anyValue = true;
        cell.value = result.value;
        cell.converted = result.converted;
        if (result.ambiguous) {
          cell.issue = 'ambiguous_date';
          issues.push({
            code: 'ambiguous_date',
            severity: 'warning',
            fieldKey: field.key,
            message: `“${cell.rawDisplay}” could be read as day-first or month-first; read as ${result.value}.`,
          });
        }
        if (typeof result.value === 'number') {
          const rangeMsg = checkRange(field, result.value);
          if (rangeMsg) {
            cell.issue ??= 'out_of_range';
            issues.push({ code: 'out_of_range', severity: 'warning', fieldKey: field.key, message: rangeMsg });
          }
        }
      } else if (result.status === 'empty') {
        if (field.required) {
          cell.issue = 'missing_required';
          issues.push({
            code: 'missing_required',
            severity: 'error',
            fieldKey: field.key,
            message: `${field.label} is empty.`,
          });
        }
      } else {
        anyValue = true;
        const code: IssueCode = field.required ? 'invalid_required' : 'invalid_optional';
        cell.issue = code;
        issues.push({
          code,
          severity: field.required ? 'error' : 'warning',
          fieldKey: field.key,
          message: field.required ? result.message : `${result.message} This optional value won't be imported.`,
        });
      }

      values[field.key] = cell.value;
      cells[field.key] = cell;
    }

    for (const field of unmappedRequired) {
      values[field.key] = null;
      issues.push({
        code: 'missing_required',
        severity: 'error',
        fieldKey: field.key,
        message: `${field.label} is not mapped to a source property.`,
      });
    }

    if (!anyValue) {
      // A blank row — replace the per-field noise with a single clear reason.
      issues.length = 0;
      issues.push({ code: 'empty_record', severity: 'error', message: 'Every mapped property is empty.' });
    }

    // Cross-field check: a winning trade in R should not be a losing trade in %.
    const r = values.result_r;
    const pl = values.profit_loss_percentage;
    if (typeof r === 'number' && typeof pl === 'number' && r !== 0 && pl !== 0 && Math.sign(r) !== Math.sign(pl)) {
      issues.push({
        code: 'sign_mismatch',
        severity: 'warning',
        message: `Result R (${r}) and P/L % (${pl}) disagree on whether the trade won or lost.`,
      });
    }

    results.push({ record, status: statusOf(issues), values, cells, issues });
  }

  flagDuplicates(results);

  const counts = { total: results.length, valid: 0, attention: 0, excluded: 0 };
  const issueCounts: Partial<Record<IssueCode, number>> = {};
  for (const r of results) {
    counts[r.status]++;
    for (const code of new Set(r.issues.map((i) => i.code))) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
  }

  return {
    datasetId: config.source.datasetId,
    mappingConfigId: config.id,
    generatedAt: new Date().toISOString(),
    records: results,
    counts,
    issueCounts,
    columnNotes,
  };
}

function statusOf(issues: ValidationIssue[]): RecordStatus {
  if (issues.some((i) => i.severity === 'error')) return 'excluded';
  if (issues.length) return 'attention';
  return 'valid';
}

/** Second and later occurrences of an identical trade are flagged (never removed). */
function flagDuplicates(results: RecordValidation[]) {
  const seen = new Map<string, RecordValidation>();
  for (const r of results) {
    if (r.status === 'excluded') continue;
    const parts = DUPLICATE_KEY_FIELDS.map((k) => r.values[k]);
    if (parts.some((p) => p === null || p === undefined)) continue;
    const key = JSON.stringify(parts);
    const first = seen.get(key);
    if (!first) {
      seen.set(key, r);
      continue;
    }
    r.duplicateOfRecordId = first.record.id;
    r.issues.push({
      code: 'duplicate',
      severity: 'warning',
      message: 'Same date, pair, setup, risk and result as an earlier trade.',
    });
    r.status = statusOf(r.issues);
  }
}
