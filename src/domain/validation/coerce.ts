import type { FieldDefinition } from '../fields/types';
import type { SourceProperty, SourceValue } from '../source/types';
import { isEmptyValue } from '../source/types';
import type { TradeFieldValue } from '../trades/types';

export type CoerceResult =
  | { status: 'ok'; value: TradeFieldValue; converted: boolean; ambiguous?: boolean }
  | { status: 'empty' }
  | { status: 'invalid'; message: string };

export type DateOrder = 'DMY' | 'MDY';

/** Per-column context derived before coercing individual values. */
export interface ColumnHints {
  dateOrder?: DateOrder;
  /** True when no value in the column disambiguates day/month order. */
  dateOrderAmbiguous?: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMERIC_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/;

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Look at every text value of a date column to decide DD/MM vs MM/DD. */
export function inferDateOrder(texts: string[]): { order: DateOrder; ambiguous: boolean } {
  let dmy = false;
  let mdy = false;
  for (const t of texts) {
    const m = NUMERIC_DATE.exec(t.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return { order: 'DMY', ambiguous: false };
  if (mdy && !dmy) return { order: 'MDY', ambiguous: false };
  return { order: 'DMY', ambiguous: true };
}

export function parseDateText(text: string, hints: ColumnHints = {}): { iso: string; ambiguous: boolean } | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
  if (m) {
    const iso = isoDate(+m[1], +m[2], +m[3]);
    return iso ? { iso, ambiguous: false } : null;
  }
  m = NUMERIC_DATE.exec(t);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const order = hints.dateOrder ?? 'DMY';
    const [d, mo] = order === 'DMY' ? [a, b] : [b, a];
    const iso = isoDate(+m[3], mo, d);
    const ambiguous = !!hints.dateOrderAmbiguous && a <= 12 && b <= 12 && a !== b;
    return iso ? { iso, ambiguous } : null;
  }
  // "12 Mar 2026", "12 March 2026"
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const iso = mo ? isoDate(+m[3], mo, +m[1]) : null;
    return iso ? { iso, ambiguous: false } : null;
  }
  // "Mar 12, 2026"
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    const iso = mo ? isoDate(+m[3], mo, +m[2]) : null;
    return iso ? { iso, ambiguous: false } : null;
  }
  return null;
}

/** Parse "1.5", "-1R", "+2.4 %", "1,234.5", "(0.8)", "−1" into a number. */
export function parseNumberText(text: string): { value: number; hadPercent: boolean } | null {
  let t = text.trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  const hadPercent = /%$/.test(t);
  t = t.replace(/%$/, '').replace(/r$/i, '');
  if (/^[+-]?\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.'); // decimal comma
  else t = t.replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return { value: negative ? -n : n, hadPercent };
}

function round(n: number, dp = 6) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function applyVocabulary(field: FieldDefinition, raw: string): CoerceResult {
  if (!field.vocabulary) return { status: 'ok', value: raw.trim(), converted: false };
  const needle = raw.trim().toLowerCase();
  for (const [canonical, synonyms] of Object.entries(field.vocabulary)) {
    if (needle === canonical || synonyms.includes(needle)) {
      return { status: 'ok', value: canonical, converted: canonical !== raw.trim() };
    }
  }
  return {
    status: 'invalid',
    message: `“${raw}” isn't a recognised ${field.label.toLowerCase()} (expected ${Object.keys(field.vocabulary).join(' / ')}).`,
  };
}

/** Convert one raw source value into the field's standard value. */
export function coerceValue(
  value: SourceValue | undefined,
  property: SourceProperty,
  field: FieldDefinition,
  hints: ColumnHints = {},
): CoerceResult {
  if (!value || isEmptyValue(value)) return { status: 'empty' };

  switch (field.valueKind) {
    case 'date': {
      if (value.kind === 'date') {
        const iso = value.start.slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? { status: 'ok', value: iso, converted: false }
          : { status: 'invalid', message: `Unreadable date “${value.start}”.` };
      }
      if (value.kind === 'text') {
        const parsed = parseDateText(value.text, hints);
        return parsed
          ? { status: 'ok', value: parsed.iso, converted: true, ambiguous: parsed.ambiguous }
          : { status: 'invalid', message: `“${value.text}” is not a recognisable date.` };
      }
      break;
    }

    case 'number': {
      let n: number | null = null;
      let converted = false;
      if (value.kind === 'number') {
        n = value.number;
        // Notion stores percent-formatted numbers as fractions: 1.5% → 0.015.
        if (field.unit === 'percent' && property.numberFormat === 'percent') {
          n = round(n * 100);
          converted = true;
        }
      } else if (value.kind === 'text' || value.kind === 'select') {
        const raw = value.kind === 'text' ? value.text : value.name;
        const parsed = parseNumberText(raw);
        if (!parsed) return { status: 'invalid', message: `“${raw}” is not a number.` };
        n = parsed.value;
        converted = true;
      }
      if (n === null) break;
      if (!Number.isFinite(n)) return { status: 'invalid', message: 'Value is not a finite number.' };
      return { status: 'ok', value: round(n), converted };
    }

    case 'string': {
      switch (value.kind) {
        case 'text':
          return applyVocabulary(field, value.text);
        case 'select':
          return applyVocabulary(field, value.name);
        case 'multi_select': {
          const r = applyVocabulary(field, value.names.join(', '));
          return r.status === 'ok' ? { ...r, converted: true } : r;
        }
        case 'number':
          return { status: 'ok', value: String(value.number), converted: true };
        case 'date':
          return { status: 'ok', value: value.start, converted: true };
        case 'url':
          return { status: 'ok', value: value.url, converted: true };
      }
      break;
    }

    case 'string_list': {
      if (value.kind === 'multi_select') return { status: 'ok', value: value.names, converted: false };
      if (value.kind === 'select') return { status: 'ok', value: [value.name], converted: true };
      if (value.kind === 'text') {
        const parts = value.text.split(',').map((s) => s.trim()).filter(Boolean);
        return { status: 'ok', value: parts, converted: true };
      }
      break;
    }

    case 'file_list': {
      if (value.kind === 'files') return { status: 'ok', value: value.files.map((f) => f.url), converted: false };
      if (value.kind === 'url') return { status: 'ok', value: [value.url], converted: true };
      if (value.kind === 'text') {
        const urls = value.text.split(/[\s,]+/).filter((s) => /^https?:\/\//.test(s));
        return urls.length
          ? { status: 'ok', value: urls, converted: true }
          : { status: 'invalid', message: 'No links found in text.' };
      }
      break;
    }
  }

  return { status: 'invalid', message: `Can't read a ${value.kind} value as ${field.label}.` };
}
