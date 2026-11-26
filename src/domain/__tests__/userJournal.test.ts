import { describe, expect, it } from 'vitest';
import { TRADE_FIELDS } from '../fields/registry';
import { createSuggestedConfig, setFieldMapping } from '../mapping/config';
import { evaluateMapping } from '../mapping/evaluate';
import { plausibilityWarning } from '../mapping/plausibility';
import { getField } from '../fields/registry';
import type { SourceDataset, SourceProperty, SourceRecord } from '../source/types';
import { schemaFingerprint } from '../source/types';
import { normaliseInstrument } from '../validation/coerce';
import { validateRecords } from '../validation/validate';

/**
 * Mirrors a real journal layout: "Result" is a Notion percent column (stored as
 * a fraction), "PnL" is a plain money amount, "Risk" is a plain number meaning %,
 * and R comes from a formula.
 */
const P = (id: string, name: string, type: SourceProperty['type'], extra: Partial<SourceProperty> = {}): SourceProperty => ({
  id, name, type, nativeType: type, ...extra,
});
const properties: SourceProperty[] = [
  P('title', 'Name', 'title'),
  P('date', 'Date', 'date'),
  P('pairs', 'Pairs', 'select'),
  P('setup', 'Setup Type', 'select'),
  P('dir', 'Direction', 'select'),
  P('sess', 'Session', 'select'),
  P('risk', 'Risk', 'number', { numberFormat: 'number' }),
  P('result', 'Result', 'number', { numberFormat: 'percent' }),
  P('pnl', 'PnL', 'number', { numberFormat: 'number' }),
  P('r', 'R Multiple', 'number', { nativeType: 'formula' }),
  P('potr', 'Potential R', 'number', { nativeType: 'formula' }),
  P('potpct', 'Potential %', 'number', { numberFormat: 'percent' }),
  P('acct', 'Account', 'multi_select'),
  P('etype', 'Entry Type', 'select'),
  P('etf', 'Entry Timeframe', 'select'),
  P('sl', 'Stop Loss', 'number'),
  P('rating', 'Rating(1-5)', 'number'),
  P('outcome', 'Outcome', 'text', { nativeType: 'formula' }),
  P('mgmt', 'Management', 'select'),
  P('status', 'Trade Status', 'select'),
  P('reason', 'Missed Reason', 'select'),
  P('psych', 'Psychology', 'multi_select'),
  P('pos', 'Positive tags', 'multi_select'),
  P('neg', 'Negative tags', 'multi_select'),
  P('struct', 'Structure Tags', 'multi_select'),
];
const dataset: SourceDataset = { id: 'ds', kind: 'notion', name: '2027 Trade Journal', recordCount: 3 };
const schema = { datasetId: 'ds', properties, fingerprint: schemaFingerprint(properties) };

const rec = (id: string, pair: string, result: number, pnl: number, r: number): SourceRecord => ({
  id,
  values: {
    date: { kind: 'date', start: '2026-11-24', end: null },
    pairs: { kind: 'select', name: pair },
    setup: { kind: 'select', name: '3 Touch' },
    dir: { kind: 'select', name: 'Short' },
    sess: { kind: 'select', name: 'Asian' },
    risk: { kind: 'number', number: 0.25 },
    result: { kind: 'number', number: result },
    pnl: { kind: 'number', number: pnl },
    r: { kind: 'number', number: r },
    acct: { kind: 'multi_select', names: ['CTI 100k', 'Leveraged 100k'] },
    mgmt: { kind: 'select', name: 'HTF Swing' },
    status: { kind: 'select', name: id === 'b' ? 'Missed' : 'Taken' },
    ...(id === 'b' ? { reason: { kind: 'select' as const, name: 'Hesitation' } } : {}),
  },
});
const records = [rec('a', 'EUR AUD', 0.0075, 750, 3), rec('b', 'EUR JPY', -0.0025, -250, -1), rec('c', 'GBP CAD', 0.0056, 560, 2.24)];

describe('journal with Result (%) and PnL (amount)', () => {
  const config = createSuggestedConfig(dataset, schema, TRADE_FIELDS);
  const mapped = (k: string) => properties.find((p) => p.id === config.entries[k].propertyId)?.name ?? null;

  it('maps percent, amount and R columns to the right fields', () => {
    expect(mapped('profit_loss_percentage')).toBe('Result');
    expect(mapped('profit_loss_amount')).toBe('PnL');
    expect(mapped('result_r')).toBe('R Multiple');
    expect(mapped('risk_percentage')).toBe('Risk');
    expect(mapped('currency_pair')).toBe('Pairs');
    expect(mapped('setup')).toBe('Setup Type');
    expect(mapped('timeframe')).toBe('Entry Timeframe');
    expect(mapped('management_style')).toBe('Management');
    expect(mapped('positive_tags')).toBe('Positive tags');
    expect(mapped('negative_tags')).toBe('Negative tags');
    expect(mapped('tags')).toBe('Structure Tags');
    expect(mapped('execution_rating')).toBe('Rating(1-5)');
    expect(mapped('trade_status')).toBe('Trade Status');
    expect(mapped('missed_reason')).toBe('Missed Reason');
    expect(mapped('psychology_tags')).toBe('Psychology');
    const ev = evaluateMapping(config, properties, TRADE_FIELDS);
    expect(ev.fields.profit_loss_percentage.status).toBe('auto_matched');
    expect(ev.canProceed).toBe(true);
  });

  it('imports values in the right units', () => {
    const report = validateRecords(records, properties, config, TRADE_FIELDS);
    expect(report.counts).toMatchObject({ valid: 3, attention: 0, excluded: 0 });
    expect(report.records[0].values).toMatchObject({
      currency_pair: 'EURAUD',
      risk_percentage: 0.25,
      profit_loss_percentage: 0.75,
      profit_loss_amount: 750,
      result_r: 3,
      management_style: 'HTF Swing',
      trade_status: 'taken',
    });
    expect(report.records[1].values).toMatchObject({ trade_status: 'missed', missed_reason: 'Hesitation' });
  });

  it('warns when a money column is mapped to P/L %', () => {
    const pnl = properties.find((p) => p.name === 'PnL')!;
    expect(plausibilityWarning(getField('profit_loss_percentage'), pnl, records)).toMatch(/amounts, not percentages/);
    const result = properties.find((p) => p.name === 'Result')!;
    expect(plausibilityWarning(getField('profit_loss_percentage'), result, records)).toBeNull();
    const wrong = setFieldMapping(config, 'profit_loss_percentage', pnl);
    const report = validateRecords(records, properties, wrong, TRADE_FIELDS);
    expect(report.issueCounts.out_of_range).toBe(3);
  });

  it('normalises instrument codes', () => {
    expect(['GBP AUD', 'gbp/aud', 'GBP-AUD', 'GBPAUD'].map(normaliseInstrument)).toEqual(Array(4).fill('GBPAUD'));
    expect(normaliseInstrument('S&P500')).toBe('S&P500');
    expect(normaliseInstrument('XAU USD')).toBe('XAUUSD');
  });
});
