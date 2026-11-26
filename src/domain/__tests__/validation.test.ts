import { describe, expect, it } from 'vitest';
import { TRADE_FIELDS, getField } from '../fields/registry';
import { buildImportBatch, defaultDecision } from '../import/importService';
import { createSuggestedConfig } from '../mapping/config';
import { evaluateMapping } from '../mapping/evaluate';
import { coerceValue, inferDateOrder, parseNumberText } from '../validation/coerce';
import { validateRecords } from '../validation/validate';
import { MockNotionConnector } from '../../sources/notion/mockConnector';
import type { SourceProperty } from '../source/types';

const numProp = (format?: SourceProperty['numberFormat']): SourceProperty => ({ id: 'x', name: 'x', type: 'number', nativeType: 'number', numberFormat: format });
const textProp: SourceProperty = { id: 't', name: 't', type: 'text', nativeType: 'rich_text' };

describe('coercion', () => {
  it('parses numeric text', () => {
    expect(parseNumberText('+1.8%')).toEqual({ value: 1.8, hadPercent: true });
    expect(parseNumberText('-1R')?.value).toBe(-1);
    expect(parseNumberText('(0.5)')?.value).toBe(-0.5);
    expect(parseNumberText('1,5')?.value).toBe(1.5);
    expect(parseNumberText('1.2.%')).toBeNull();
  });
  it('rescales Notion percent-format numbers', () => {
    const r = coerceValue({ kind: 'number', number: 0.015 }, numProp('percent'), getField('risk_percentage'));
    expect(r).toMatchObject({ status: 'ok', value: 1.5 });
  });
  it('infers date order from the column', () => {
    expect(inferDateOrder(['01/02/2026', '25/02/2026']).order).toBe('DMY');
    expect(inferDateOrder(['02/25/2026']).order).toBe('MDY');
    expect(inferDateOrder(['01/02/2026']).ambiguous).toBe(true);
  });
  it('rejects impossible dates', () => {
    const r = coerceValue({ kind: 'text', text: '31/02/2026' }, textProp, getField('trade_date'), { dateOrder: 'DMY' });
    expect(r.status).toBe('invalid');
  });
  it('normalises vocabulary values', () => {
    expect(coerceValue({ kind: 'select', name: 'Buy' }, textProp, getField('direction'))).toMatchObject({ value: 'long' });
    expect(coerceValue({ kind: 'select', name: 'Hedge' }, textProp, getField('direction')).status).toBe('invalid');
  });
});

describe('end-to-end with mock Notion data', async () => {
  const connector = new MockNotionConnector(undefined, 0);
  const datasets = await connector.listDatasets();

  for (const dataset of datasets) {
    it(`${dataset.name}: every record is accounted for`, async () => {
      const schema = await connector.getSchema(dataset.id);
      const records = await connector.fetchRecords(dataset.id);
      const config = createSuggestedConfig(dataset, schema, TRADE_FIELDS);
      const report = validateRecords(records, schema.properties, config, TRADE_FIELDS);
      expect(report.records).toHaveLength(records.length);
      const { valid, attention, excluded, total } = report.counts;
      expect(valid + attention + excluded).toBe(total);

      const decisions = Object.fromEntries(report.records.map((r) => [r.record.id, defaultDecision(r)]));
      const batch = buildImportBatch(report, decisions, dataset, config, TRADE_FIELDS);
      expect(batch.trades.length + batch.skipped.length).toBe(total);
      for (const t of batch.trades) {
        expect(t.source.recordId).toBeTruthy();
        expect(typeof t.risk_percentage).toBe('number');
      }
    });
  }

  it('journal: auto-maps all six mandatory fields and flags injected problems', async () => {
    const ds = datasets[0];
    const schema = await connector.getSchema(ds.id);
    const config = createSuggestedConfig(ds, schema, TRADE_FIELDS);
    const ev = evaluateMapping(config, schema.properties, TRADE_FIELDS);
    expect(ev.summary.mandatoryMapped).toBe(6);
    const report = validateRecords(await connector.fetchRecords(ds.id), schema.properties, config, TRADE_FIELDS);
    expect(report.issueCounts.duplicate).toBe(1);
    expect(report.issueCounts.empty_record).toBe(1);
    expect(report.issueCounts.missing_required).toBe(1);
    expect(report.issueCounts.out_of_range).toBeGreaterThanOrEqual(1);
  });
});
