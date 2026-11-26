import { describe, expect, it } from 'vitest';
import { TRADE_FIELDS } from '../fields/registry';
import { createSuggestedConfig, setFieldMapping } from '../mapping/config';
import { evaluateMapping } from '../mapping/evaluate';
import { normaliseName, scoreName } from '../mapping/matcher';
import { reconcileMapping } from '../mapping/reconcile';
import { suggestMappings } from '../mapping/suggest';
import type { SourceDataset, SourceProperty, SourceSchema } from '../source/types';
import { schemaFingerprint } from '../source/types';

const prop = (id: string, name: string, type: SourceProperty['type'], extra: Partial<SourceProperty> = {}): SourceProperty => ({
  id, name, type, nativeType: type, ...extra,
});
const schemaOf = (properties: SourceProperty[]): SourceSchema => ({ datasetId: 'db', properties, fingerprint: schemaFingerprint(properties) });
const dataset: SourceDataset = { id: 'db', kind: 'notion', name: 'Test', recordCount: 0 };

describe('matcher', () => {
  it('normalises symbols and punctuation', () => {
    expect(normaliseName('P/L %')).toBe('p l percent');
    expect(normaliseName('R:R Result')).toBe('r r result');
  });
  it('recognises naming conventions', () => {
    expect(scoreName('Trade Date', 'Trade Date')).toBe(1);
    expect(scoreName('trade_date', 'Trade Date')).toBe(1);
    expect(scoreName('RiskPercentage', 'Risk Percentage')).toBeGreaterThan(0.9);
    expect(scoreName('Pair', 'Risk')).toBe(0);
  });
});

describe('suggestMappings', () => {
  const variants: [string, SourceProperty['type'], string][] = [
    ['Entry Date', 'date', 'trade_date'],
    ['Instrument', 'select', 'currency_pair'],
    ['Strategy', 'select', 'setup'],
    ['Risk Percentage', 'number', 'risk_percentage'],
    ['R Multiple', 'number', 'result_r'],
    ['Return %', 'number', 'profit_loss_percentage'],
  ];
  it('maps alternative names to the mandatory fields', () => {
    const props = variants.map(([n, t], i) => prop(`p${i}`, n, t));
    const s = suggestMappings(TRADE_FIELDS, props);
    variants.forEach(([name, , field]) => expect(s[field].propertyNameSnapshot).toBe(name));
  });
  it('does not auto-map a text property to a date field with a confident score', () => {
    const s = suggestMappings(TRADE_FIELDS, [prop('a', 'Date', 'text')]);
    expect(s.trade_date.propertyId).toBe('a');
    expect(s.trade_date.confidence).toBeLessThan(0.85);
  });
  it('never suggests an incompatible type', () => {
    const s = suggestMappings(TRADE_FIELDS, [prop('a', 'Date', 'checkbox')]);
    expect(s.trade_date.propertyId).toBeNull();
  });
  it('suggests each property at most once', () => {
    const s = suggestMappings(TRADE_FIELDS, [prop('a', 'Entry', 'number')]);
    const used = Object.values(s).filter((e) => e.propertyId === 'a');
    expect(used.length).toBeLessThanOrEqual(1);
  });
});

describe('evaluateMapping', () => {
  const props = [
    prop('d', 'Date', 'date'), prop('p', 'Pair', 'select'), prop('s', 'Setup', 'select'),
    prop('r', 'Risk %', 'number'), prop('rr', 'Result R', 'number'), prop('pl', 'Result %', 'text'),
  ];
  const config = createSuggestedConfig(dataset, schemaOf(props), TRADE_FIELDS);

  it('classifies matched, uncertain and unmapped fields', () => {
    const ev = evaluateMapping(config, props, TRADE_FIELDS);
    expect(ev.fields.trade_date.status).toBe('auto_matched');
    expect(ev.fields.profit_loss_percentage.status).toBe('uncertain');
    expect(ev.fields.direction.status).toBe('unmapped');
    expect(ev.canProceed).toBe(true);
  });
  it('blocks when a mandatory field is missing', () => {
    const ev = evaluateMapping(setFieldMapping(config, 'setup', null), props, TRADE_FIELDS);
    expect(ev.fields.setup.status).toBe('missing');
    expect(ev.canProceed).toBe(false);
  });
  it('blocks one property feeding fields of different types', () => {
    const c = setFieldMapping(config, 'trade_notes', props[3]); // Risk % (number) → notes (string)
    const ev = evaluateMapping(c, props, TRADE_FIELDS);
    expect(ev.fields.trade_notes.status).toBe('conflict');
    expect(ev.fields.risk_percentage.status).toBe('conflict');
    expect(ev.canProceed).toBe(false);
  });
  it('allows sharing between fields of the same type', () => {
    const c = setFieldMapping(config, 'date_closed', props[0]);
    const ev = evaluateMapping(c, props, TRADE_FIELDS);
    expect(ev.fields.date_closed.status).toBe('manual');
    expect(ev.canProceed).toBe(true);
  });
});

describe('reconcileMapping', () => {
  const props = [prop('d', 'Date', 'date'), prop('p', 'Pair', 'select'), prop('s', 'Setup', 'select')];
  const saved = createSuggestedConfig(dataset, schemaOf(props), TRADE_FIELDS);

  it('follows renamed properties by id', () => {
    const next = [prop('d', 'Opened', 'date'), props[1], props[2]];
    const { config, changes } = reconcileMapping(saved, schemaOf(next), TRADE_FIELDS);
    expect(config.entries.trade_date.propertyId).toBe('d');
    expect(changes).toContainEqual({ type: 'renamed', fieldKey: 'trade_date', from: 'Date', to: 'Opened' });
  });
  it('re-links by name when the id changed, and reports removed properties', () => {
    const next = [prop('d2', 'Date', 'date'), props[1]];
    const { config, changes } = reconcileMapping(saved, schemaOf(next), TRADE_FIELDS);
    expect(config.entries.trade_date.propertyId).toBe('d2');
    expect(changes.some((c) => c.type === 'removed' && c.fieldKey === 'setup')).toBe(true);
    expect(evaluateMapping(config, next, TRADE_FIELDS).fields.setup.status).toBe('stale');
  });
  it('suggests mappings for fields added to the registry later', () => {
    const fields = TRADE_FIELDS.filter((f) => f.key !== 'setup');
    const older = createSuggestedConfig(dataset, schemaOf(props), fields);
    const { config, changes } = reconcileMapping(older, schemaOf(props), TRADE_FIELDS);
    expect(config.entries.setup.propertyId).toBe('s');
    expect(changes).toContainEqual({ type: 'new_field', fieldKey: 'setup', suggested: 'Setup' });
  });
});
