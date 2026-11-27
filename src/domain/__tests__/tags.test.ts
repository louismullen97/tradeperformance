import { describe, expect, it } from 'vitest';
import { tagsBySetup } from '../analytics/edge';
import { TRADE_FIELDS } from '../fields/registry';
import { buildImportBatch } from '../import/importService';
import { createSuggestedConfig } from '../mapping/config';
import { reconcileMapping } from '../mapping/reconcile';
import type { SourceProperty, SourceRecord } from '../source/types';
import { schemaFingerprint } from '../source/types';
import { badTagsOf, canonicalBehaviour, goodTagsOf, tagGroups, tagsOf } from '../tags/tags';
import type { StandardTrade } from '../trades/types';
import { validateRecords } from '../validation/validate';

const P = (id: string, name: string, type: SourceProperty['type']): SourceProperty => ({ id, name, type, nativeType: type });

/** The journal after the Behaviour / Technical restructure, plus a column the user added themselves. */
const props = [
  P('title', 'Name', 'title'), P('date', 'Date', 'date'), P('pairs', 'Pairs', 'select'), P('setup', 'Setup Type', 'select'),
  P('risk', 'Risk', 'number'), P('r', 'R Multiple', 'number'), P('result', 'Result', 'number'), P('acct', 'Account', 'multi_select'),
  P('rating', 'Rating(1-5)', 'number'), P('review', 'Review rating (1-5)', 'number'), P('psych', 'Psychology', 'multi_select'),
  P('beh', 'Behaviour', 'multi_select'), P('tech', 'Technical', 'multi_select'), P('status', 'Trade Status', 'select'),
  P('reason', 'Missed Reason', 'select'), P('conf', 'Entry checklist', 'multi_select'),
];
const schema = { datasetId: 'ds', properties: props, fingerprint: schemaFingerprint(props) };
const dataset = { id: 'ds', kind: 'notion' as const, name: '2027 Trade Journal', recordCount: 2 };
const rec = (id: string, extra: SourceRecord['values']): SourceRecord => ({
  id,
  values: {
    date: { kind: 'date', start: '2026-11-24', end: null }, pairs: { kind: 'select', name: 'EUR USD' }, setup: { kind: 'select', name: '3 Touch' },
    risk: { kind: 'number', number: 0.25 }, r: { kind: 'number', number: 2 }, result: { kind: 'number', number: 0.005 }, ...extra,
  },
});

describe('journal tag columns', () => {
  const config = createSuggestedConfig(dataset, schema, TRADE_FIELDS);
  const mapped = (k: string) => props.find((p) => p.id === config.entries[k].propertyId)?.name ?? null;

  it('maps Behaviour, Technical and both ratings', () => {
    expect([mapped('behaviour_tags'), mapped('technical_tags'), mapped('psychology_tags'), mapped('execution_rating'), mapped('review_rating')]).toEqual([
      'Behaviour', 'Technical', 'Psychology', 'Rating(1-5)', 'Review rating (1-5)',
    ]);
  });

  it('imports any other multi-select column as a custom tag group', () => {
    const records = [
      rec('a', { beh: { kind: 'multi_select', names: ['Followed plan'] }, tech: { kind: 'multi_select', names: ['Inline with HTF Trend'] }, conf: { kind: 'multi_select', names: ['Retest confirmed'] } }),
      rec('b', { pairs: { kind: 'select', name: 'GBP JPY' }, beh: { kind: 'multi_select', names: ['revenge-trading'] }, status: { kind: 'select', name: 'Missed' }, reason: { kind: 'select', name: 'Fear after a loss' } }),
    ];
    const report = validateRecords(records, props, config, TRADE_FIELDS);
    expect(report.extraTagColumns).toEqual([{ propertyId: 'conf', name: 'Entry checklist' }]);
    const trades = buildImportBatch(report, {}, dataset, config, TRADE_FIELDS).trades;
    expect(tagsOf(trades[0])).toMatchObject({ behaviour: ['Followed plan'], technical: ['Inline with HTF Trend'], custom: { 'Entry checklist': ['Retest confirmed'] } });
    // Spelling is normalised, and a behavioural missed reason counts as behaviour.
    expect(tagsOf(trades[1]).behaviour).toEqual(['Revenge trading', 'Hesitation']);
    expect(tagGroups(trades).map((g) => g.label)).toEqual(['Behaviour', 'Technical', 'Entry checklist']);
  });

  it('keeps working after old Positive/Negative columns are deleted', () => {
    const old = [...props.filter((p) => !['beh', 'tech'].includes(p.id)), P('pos', 'Positive tags', 'multi_select'), P('neg', 'Negative tags', 'multi_select')];
    const saved = createSuggestedConfig(dataset, { datasetId: 'ds', properties: old, fingerprint: schemaFingerprint(old) }, TRADE_FIELDS.filter((f) => !['behaviour_tags', 'technical_tags'].includes(f.key)));
    const { config: next } = reconcileMapping(saved, schema, TRADE_FIELDS);
    expect(props.find((p) => p.id === next.entries.behaviour_tags.propertyId)?.name).toBe('Behaviour');
    expect(props.find((p) => p.id === next.entries.technical_tags.propertyId)?.name).toBe('Technical');
  });
});

const t = (setup: string, r: number, optional: Record<string, unknown>): StandardTrade => ({
  id: `${setup}${r}${JSON.stringify(optional)}`, trade_date: '2026-11-02', currency_pair: 'EURUSD', setup, risk_percentage: 0.25, result_r: r, profit_loss_percentage: r / 4,
  optional: optional as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'd', datasetName: 'J', recordId: 'x', mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

describe('tag organisation', () => {
  it('sorts older Positive/Negative tags: negatives are mistakes, other positives are technical', () => {
    const trade = t('3 Touch', -1, { positive_tags: ['Inline with HTF Trend'], negative_tags: ['revenge-trading', 'sl-placement'] });
    expect(tagsOf(trade)).toMatchObject({ behaviour: ['Revenge trading', 'sl-placement'], technical: ['Inline with HTF Trend'] });
    expect(badTagsOf(trade)).toEqual(['Revenge trading', 'sl-placement']);
    expect(goodTagsOf(trade)).toEqual([]);
  });
  it('recognises common spellings', () => {
    expect(['FOMO', 'early-exit', 'Felt calm', 'Max trades reached', 'Breakout'].map(canonicalBehaviour)).toEqual(['FOMO entry', 'Early exit', 'Calm', 'Followed plan', null]);
  });
  it('finds the best and worst tags for each setup', () => {
    const trades = [
      ...Array.from({ length: 5 }, () => t('3 Touch', 2, { technical_tags: ['Inline with HTF Trend'] })),
      ...Array.from({ length: 4 }, () => t('3 Touch', -1, { behaviour_tags: ['Early exit'] })),
      t('3 Touch', 1, {}),
    ];
    const [row] = tagsBySetup(trades);
    expect(row.setup).toBe('3 Touch');
    expect(row.best[0]).toMatchObject({ tag: 'Inline with HTF Trend', group: 'Technical', lowSample: false });
    expect(row.worst[0]).toMatchObject({ tag: 'Early exit', group: 'Behaviour', lowSample: true });
  });
});

import { commonFactors, insightSentence } from '../analytics/insights';
import type { FlowEntry } from '../flow/flow';

describe('insights', () => {
  const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
  const flow = (d: number, score: number): FlowEntry => ({ id: `f${d}`, date: day(d), score, timeOfDay: null, positive: [], negative: [], notes: null, source: { kind: 'notion', datasetId: 'f', datasetName: 'F', recordId: `f${d}` } });
  // Losses all on low-flow days with revenge trading; wins on high-flow days.
  const trades = [
    ...[2, 3, 4, 5].map((d) => ({ ...t('3 Touch', -1, { behaviour_tags: ['Revenge trading'] }), id: `l${d}`, trade_date: day(d) })),
    ...[9, 10, 11, 12, 13, 16].map((d) => ({ ...t('3 Touch', 2, {}), id: `w${d}`, trade_date: day(d) })),
  ];
  const entries = [...[2, 3, 4, 5].map((d) => flow(d, 3)), ...[9, 10, 11, 12, 13, 16].map((d) => flow(d, 8.5))];

  it('finds what losing trades have in common', () => {
    const losses = commonFactors(trades, 'loss', { flow: entries });
    const flowInsight = losses.find((i) => i.factor === 'Flow')!;
    expect(flowInsight).toMatchObject({ value: 'Low', hits: 4, of: 4, share: 1, baseline: 0.4, lowSample: true });
    expect(insightSentence(flowInsight, 'loss')).toBe('4 of your 4 losses (100%) came on low-flow days (under 5) — only 40% of all your trades did.');
    expect(losses.some((i) => i.factor === 'Behaviour' && i.value === 'Revenge trading')).toBe(true);
  });
  it('finds what winning trades have in common', () => {
    expect(commonFactors(trades, 'win', { flow: entries }).find((i) => i.factor === 'Flow')).toMatchObject({ value: 'High', hits: 6, share: 1, baseline: 0.6 });
  });
  it('stays quiet without enough trades', () => {
    expect(commonFactors(trades.slice(0, 3), 'loss', { flow: entries })).toEqual([]);
  });
});
