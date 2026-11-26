import type {
  SourceDataset,
  SourceProperty,
  SourcePropertyType,
  SourceRecord,
  SourceSchema,
  SourceValue,
} from '../../domain/source/types';
import { schemaFingerprint } from '../../domain/source/types';
import type { NotionDatabase, NotionPage, NotionPropertySchema, NotionPropertyValue, NotionRichText } from './types';

const plain = (rt: NotionRichText[]) => rt.map((t) => t.plain_text).join('');

const DIRECT_TYPES: Record<string, SourcePropertyType> = {
  title: 'title',
  rich_text: 'text',
  number: 'number',
  select: 'select',
  status: 'select',
  multi_select: 'multi_select',
  date: 'date',
  created_time: 'date',
  checkbox: 'checkbox',
  url: 'url',
  files: 'files',
};

/**
 * Notion's schema doesn't say what a formula returns, so we infer it from
 * sample pages (the first non-null result wins).
 */
function inferFormulaType(name: string, samples: NotionPage[]): SourcePropertyType {
  for (const page of samples) {
    const v = page.properties[name];
    if (v?.type !== 'formula') continue;
    const f = v.formula;
    if (f.type === 'number' && f.number !== null) return 'number';
    if (f.type === 'string' && f.string) return 'text';
    if (f.type === 'date' && f.date) return 'date';
    if (f.type === 'boolean' && f.boolean !== null) return 'checkbox';
  }
  return 'unknown';
}

export function translateProperty(schema: NotionPropertySchema, samples: NotionPage[]): SourceProperty {
  const base = { id: schema.id, name: schema.name, nativeType: schema.type };
  switch (schema.type) {
    case 'number':
      return {
        ...base,
        type: 'number',
        numberFormat: schema.number.format === 'percent' ? 'percent' : schema.number.format.includes('dollar') || schema.number.format.includes('euro') || schema.number.format.includes('pound') ? 'currency' : 'number',
      };
    case 'select':
      return { ...base, type: 'select', options: schema.select.options.map((o) => o.name) };
    case 'status':
      return { ...base, type: 'select', options: schema.status.options.map((o) => o.name) };
    case 'multi_select':
      return { ...base, type: 'multi_select', options: schema.multi_select.options.map((o) => o.name) };
    case 'formula':
      return { ...base, type: inferFormulaType(schema.name, samples) };
    default:
      return { ...base, type: DIRECT_TYPES[schema.type] ?? 'unknown' };
  }
}

export function translateSchema(db: NotionDatabase, samples: NotionPage[]): SourceSchema {
  const properties = Object.values(db.properties).map((p) => translateProperty(p, samples));
  return { datasetId: db.id, properties, fingerprint: schemaFingerprint(properties) };
}

export function translateDataset(db: NotionDatabase, recordCount: number, workspace: string): SourceDataset {
  return {
    id: db.id,
    kind: 'notion',
    name: plain(db.title) || 'Untitled',
    icon: db.icon?.emoji,
    url: db.url,
    recordCount,
    lastEditedTime: db.last_edited_time,
    workspace,
  };
}

export function translateValue(v: NotionPropertyValue | undefined): SourceValue {
  if (!v) return { kind: 'empty' };
  switch (v.type) {
    case 'title':
      return { kind: 'text', text: plain(v.title) };
    case 'rich_text':
      return { kind: 'text', text: plain(v.rich_text) };
    case 'number':
      return v.number === null ? { kind: 'empty' } : { kind: 'number', number: v.number };
    case 'select':
      return v.select ? { kind: 'select', name: v.select.name } : { kind: 'empty' };
    case 'status':
      return v.status ? { kind: 'select', name: v.status.name } : { kind: 'empty' };
    case 'multi_select':
      return { kind: 'multi_select', names: v.multi_select.map((o) => o.name) };
    case 'date':
      return v.date ? { kind: 'date', start: v.date.start, end: v.date.end } : { kind: 'empty' };
    case 'created_time':
      return { kind: 'date', start: v.created_time, end: null };
    case 'checkbox':
      return { kind: 'checkbox', checked: v.checkbox };
    case 'url':
      return v.url ? { kind: 'url', url: v.url } : { kind: 'empty' };
    case 'files':
      return {
        kind: 'files',
        files: v.files.map((f) => ({ name: f.name, url: f.type === 'external' ? f.external.url : f.file.url })),
      };
    case 'formula': {
      const f = v.formula;
      if (f.type === 'number') return f.number === null ? { kind: 'empty' } : { kind: 'number', number: f.number };
      if (f.type === 'string') return f.string ? { kind: 'text', text: f.string } : { kind: 'empty' };
      if (f.type === 'date') return f.date ? { kind: 'date', start: f.date.start, end: f.date.end } : { kind: 'empty' };
      return f.boolean === null ? { kind: 'empty' } : { kind: 'checkbox', checked: f.boolean };
    }
  }
}

export function translatePage(page: NotionPage): SourceRecord {
  const values: Record<string, SourceValue> = {};
  for (const v of Object.values(page.properties)) values[v.id] = translateValue(v);
  return {
    id: page.id,
    url: page.url,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    values,
  };
}
