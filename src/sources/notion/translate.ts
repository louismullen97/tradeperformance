import type {
  SourceDataset,
  SourceProperty,
  SourcePropertyType,
  SourceRecord,
  SourceSchema,
  SourceValue,
} from '../../domain/source/types';
import { schemaFingerprint } from '../../domain/source/types';
import type { NotionDataSource, NotionPage, NotionPropertySchema, NotionPropertyValue, NotionRichText } from './types';

const plain = (rt: NotionRichText[] | undefined) => (rt ?? []).map((t) => t.plain_text).join('');

const DIRECT_TYPES: Record<string, SourcePropertyType> = {
  title: 'title',
  rich_text: 'text',
  number: 'number',
  select: 'select',
  status: 'select',
  multi_select: 'multi_select',
  date: 'date',
  created_time: 'date',
  last_edited_time: 'date',
  checkbox: 'checkbox',
  url: 'url',
  email: 'text',
  phone_number: 'text',
  unique_id: 'text',
  files: 'files',
};

/** Value types whose result is only known from page data (formula, rollup). */
function inferComputedType(name: string, samples: NotionPage[]): SourcePropertyType {
  for (const page of samples) {
    const v = translateValue(page.properties[name]);
    switch (v.kind) {
      case 'number':
        return 'number';
      case 'text':
        return 'text';
      case 'date':
        return 'date';
      case 'checkbox':
        return 'checkbox';
    }
  }
  return 'unknown';
}

const CURRENCY_FORMATS = /dollar|euro|pound|yen|ruble|rupee|won|yuan|real|lira|rupiah|franc|krona|krone|zloty|baht|forint|koruna|shekel|peso|rand|ringgit|leu|riyal|dirham|dong/;

export function translateProperty(schema: NotionPropertySchema, samples: NotionPage[]): SourceProperty {
  const base = { id: schema.id, name: schema.name, nativeType: schema.type };
  switch (schema.type) {
    case 'number': {
      const fmt = schema.number?.format ?? 'number';
      return {
        ...base,
        type: 'number',
        numberFormat: fmt === 'percent' ? 'percent' : CURRENCY_FORMATS.test(fmt) ? 'currency' : 'number',
      };
    }
    case 'select':
      return { ...base, type: 'select', options: schema.select.options.map((o) => o.name) };
    case 'status':
      return { ...base, type: 'select', options: schema.status.options.map((o) => o.name) };
    case 'multi_select':
      return { ...base, type: 'multi_select', options: schema.multi_select.options.map((o) => o.name) };
    case 'formula':
    case 'rollup':
      return { ...base, type: inferComputedType(schema.name, samples) };
    default:
      return { ...base, type: DIRECT_TYPES[schema.type] ?? 'unknown' };
  }
}

export function translateSchema(ds: NotionDataSource, samples: NotionPage[]): SourceSchema {
  const properties = Object.values(ds.properties).map((p) => translateProperty(p, samples));
  return { datasetId: ds.id, properties, fingerprint: schemaFingerprint(properties) };
}

export function dataSourceTitle(ds: NotionDataSource): string {
  return plain(ds.title).trim() || 'Untitled';
}

export function translateDataset(ds: NotionDataSource, recordCount: number | null, workspace: string): SourceDataset {
  return {
    id: ds.id,
    kind: 'notion',
    name: dataSourceTitle(ds),
    icon: ds.icon && ds.icon.type === 'emoji' && 'emoji' in ds.icon ? ds.icon.emoji : undefined,
    recordCount,
    lastEditedTime: ds.last_edited_time,
    workspace,
  };
}

const dateValue = (d: { start: string; end: string | null } | null): SourceValue =>
  d ? { kind: 'date', start: d.start, end: d.end } : { kind: 'empty' };

const textValue = (s: string | null | undefined): SourceValue => (s ? { kind: 'text', text: s } : { kind: 'empty' });

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
      return dateValue(v.date);
    case 'created_time':
      return { kind: 'date', start: v.created_time, end: null };
    case 'last_edited_time':
      return { kind: 'date', start: v.last_edited_time, end: null };
    case 'checkbox':
      return { kind: 'checkbox', checked: v.checkbox };
    case 'url':
      return v.url ? { kind: 'url', url: v.url } : { kind: 'empty' };
    case 'email':
      return textValue(v.email);
    case 'phone_number':
      return textValue(v.phone_number);
    case 'unique_id':
      return v.unique_id.number === null
        ? { kind: 'empty' }
        : { kind: 'text', text: `${v.unique_id.prefix ? `${v.unique_id.prefix}-` : ''}${v.unique_id.number}` };
    case 'files':
      return {
        kind: 'files',
        files: v.files.map((f) => ({ name: f.name, url: f.type === 'external' ? f.external.url : f.file.url })),
      };
    case 'formula': {
      const f = v.formula;
      if (f.type === 'number') return f.number === null ? { kind: 'empty' } : { kind: 'number', number: f.number };
      if (f.type === 'string') return textValue(f.string);
      if (f.type === 'date') return dateValue(f.date);
      return f.boolean === null ? { kind: 'empty' } : { kind: 'checkbox', checked: f.boolean };
    }
    case 'rollup': {
      const r = v.rollup;
      if (r.type === 'number' && 'number' in r) return r.number === null ? { kind: 'empty' } : { kind: 'number', number: r.number };
      if (r.type === 'date' && 'date' in r) return dateValue(r.date);
      return { kind: 'empty' }; // array rollups aren't mappable to a single trade value
    }
    default:
      return { kind: 'empty' }; // people, relation, button, ... — not used by trade fields
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
