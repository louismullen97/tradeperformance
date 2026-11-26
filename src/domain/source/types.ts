/**
 * Source-agnostic description of an external dataset (a Notion database,
 * a CSV file, ...). Every connector translates its native format into these
 * types; nothing downstream of here knows which provider the data came from.
 */

export type SourceKind = 'notion' | 'csv';

/** Normalised property types. Provider-specific types are translated into these. */
export type SourcePropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'files'
  | 'unknown';

export interface SourceProperty {
  /** Stable identifier from the provider. Survives renames in Notion. */
  id: string;
  name: string;
  type: SourcePropertyType;
  /** Number display format, e.g. Notion's `percent` (stored as a fraction). */
  numberFormat?: 'number' | 'percent' | 'currency';
  /** Known options for select / multi-select properties. */
  options?: string[];
  /** Provider-native type, kept for display and debugging (e.g. `formula`, `status`). */
  nativeType: string;
}

export type SourceValue =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; number: number }
  | { kind: 'select'; name: string }
  | { kind: 'multi_select'; names: string[] }
  | { kind: 'date'; start: string; end: string | null }
  | { kind: 'checkbox'; checked: boolean }
  | { kind: 'url'; url: string }
  | { kind: 'files'; files: { name: string; url: string }[] };

export interface SourceRecord {
  /** Provider record identifier (Notion page id, CSV row number, ...). */
  id: string;
  url?: string;
  createdTime?: string;
  lastEditedTime?: string;
  /** Values keyed by SourceProperty.id. */
  values: Record<string, SourceValue>;
}

export interface SourceDataset {
  id: string;
  kind: SourceKind;
  name: string;
  icon?: string;
  url?: string;
  recordCount: number;
  lastEditedTime?: string;
  workspace?: string;
}

export interface SourceSchema {
  datasetId: string;
  properties: SourceProperty[];
  /** Hash of property ids + types; changes when the source structure changes. */
  fingerprint: string;
}

/**
 * Contract each data provider implements. The mock Notion connector, a future
 * real Notion connector and a CSV connector all satisfy this interface.
 */
export interface DataSourceConnector {
  readonly kind: SourceKind;
  readonly label: string;
  listDatasets(): Promise<SourceDataset[]>;
  getSchema(datasetId: string): Promise<SourceSchema>;
  fetchRecords(datasetId: string): Promise<SourceRecord[]>;
}

export function isEmptyValue(value: SourceValue | undefined): boolean {
  if (!value) return true;
  switch (value.kind) {
    case 'empty':
      return true;
    case 'text':
      return value.text.trim() === '';
    case 'select':
      return value.name.trim() === '';
    case 'multi_select':
      return value.names.length === 0;
    case 'files':
      return value.files.length === 0;
    case 'url':
      return value.url.trim() === '';
    default:
      return false;
  }
}

/** Human-readable rendering of a raw source value, used for previews and provenance. */
export function displaySourceValue(value: SourceValue | undefined): string {
  if (!value) return '—';
  switch (value.kind) {
    case 'empty':
      return '—';
    case 'text':
      return value.text || '—';
    case 'number':
      return String(value.number);
    case 'select':
      return value.name;
    case 'multi_select':
      return value.names.join(', ') || '—';
    case 'date':
      return value.end ? `${value.start} → ${value.end}` : value.start;
    case 'checkbox':
      return value.checked ? 'Yes' : 'No';
    case 'url':
      return value.url;
    case 'files':
      return value.files.length ? `${value.files.length} file(s)` : '—';
  }
}

export function schemaFingerprint(properties: SourceProperty[]): string {
  const basis = [...properties]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}:${p.type}`)
    .join('|');
  // FNV-1a — fast, deterministic, good enough for change detection.
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
