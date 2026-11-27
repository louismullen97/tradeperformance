import { describe, expect, it } from 'vitest';
import { getDimension } from '../analytics/dimensions';
import { edgeAnalysis, tagMatrix } from '../analytics/edge';
import { tagGroup } from '../tags/tags';
import { dailyFlow, flowByDayOutcome, flowByTimeOfDay, flowCorrelation, tradesByFlowBand, type FlowEntry } from '../flow/flow';
import { goalProgress, newGoal } from '../goals/goals';
import type { StandardTrade } from '../trades/types';

let n = 0;
const t = (date: string, r: number, setup: string, opt: Record<string, unknown> = {}): StandardTrade => ({
  id: `e${++n}`, trade_date: date, currency_pair: 'EURUSD', setup, risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: opt as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `e${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

// 3 Touch on 15m wins; 2 Touch in New York loses; noise elsewhere.
const trades = [
  ...Array.from({ length: 6 }, (_, i) => t(`2026-11-0${i + 2}`, 2, '3 Touch', { timeframe: '15m', trading_session: 'London', psychology_tags: ['Felt calm'] })),
  ...Array.from({ length: 6 }, (_, i) => t(`2026-11-1${i}`, -1, '2 Touch', { timeframe: 'H1', trading_session: 'New York', psychology_tags: ['FOMO'] })),
  t('2026-11-20', 3, 'V-Shape', { timeframe: 'H1', trading_session: 'London' }),
  t('2026-11-21', 3, 'V-Shape', { timeframe: 'H1', trading_session: 'London' }),
];

describe('edge', () => {
  const r = edgeAnalysis(trades);
  it('puts consistently profitable segments in edge and losing ones in needs work', () => {
    expect(r.edge.some((s) => s.factors.some((f) => f.value === '3 Touch'))).toBe(true);
    expect(r.needsWork.some((s) => s.factors.some((f) => f.value === '2 Touch'))).toBe(true);
    expect(r.edge.every((s) => (s.stats.avgR ?? 0) > 0)).toBe(true);
    expect(r.needsWork.every((s) => (s.stats.avgR ?? 0) < 0)).toBe(true);
  });
  it('ignores segments below the minimum sample', () => {
    // V-Shape has only 2 trades (+3R each) — great, but not enough evidence.
    expect([...r.edge, ...r.needsWork].some((s) => s.factors.some((f) => f.value === 'V-Shape'))).toBe(false);
  });
  it('builds an A+ trade profile', () => {
    expect(r.profile.find((p) => p.dimension === 'Setup')?.segment.factors[0].value).toBe('3 Touch');
    expect(r.profile.find((p) => p.dimension === 'Psychology')?.segment.factors[0].value).toBe('Felt calm');
  });
});

describe('tag matrix', () => {
  it('crosses a dimension with a tag group', () => {
    const m = tagMatrix(trades, getDimension('setup'), tagGroup('psychology'));
    expect(m.cols).toEqual(['Felt calm', 'FOMO']);
    expect(m.cell('3 Touch', 'Felt calm').stats).toMatchObject({ count: 6, winRate: 1, avgR: 2 });
    expect(m.cell('3 Touch', 'FOMO').stats.count).toBe(0);
  });
});

describe('flow', () => {
  const e = (date: string, score: number, timeOfDay: string | null): FlowEntry => ({
    id: `${date}${timeOfDay}`, date, score, timeOfDay, positive: score > 6 ? ['Good sleep'] : [], negative: score <= 6 ? ['Poor sleep'] : [], notes: null,
    source: { kind: 'notion', datasetId: 'f', datasetName: 'Flow', recordId: 'x' },
  });
  const entries = [
    ...['02', '03', '04', '05', '06'].flatMap((d) => [e(`2026-11-${d}`, 9, 'Morning'), e(`2026-11-${d}`, 8, 'Afternoon')]),
    ...['10', '11', '12', '13', '14', '15'].map((d) => e(`2026-11-${d}`, 3, 'Morning')),
  ];
  const days = dailyFlow(entries);
  it('averages several check-ins per day', () => {
    expect(days.get('2026-11-02')?.avg).toBe(8.5);
  });
  it('groups trades by the day’s flow band', () => {
    const { rows, unmatched } = tradesByFlowBand(trades, days);
    expect(rows.find((r) => r.band.key === 'high')?.stats).toMatchObject({ count: 5, avgR: 2 });
    expect(rows.find((r) => r.band.key === 'low')?.stats.avgR).toBe(-1);
    expect(unmatched).toBe(3);
  });
  it('compares flow on green and red days and correlates with results', () => {
    expect(flowByDayOutcome(trades, days)).toMatchObject({ green: 8.5, red: 3 });
    expect(flowCorrelation(trades, days)!.r).toBeGreaterThan(0.9);
    expect(flowByTimeOfDay(entries).map((s) => s.slot)).toEqual(['Morning', 'Afternoon']);
  });
});

describe('goals without a time limit', () => {
  it('counts every trade since the first and has no pace', () => {
    const p = goalProgress(newGoal('net_pl', 'all', 8), trades, '2026-11-26');
    expect(p.start).toBe('2026-11-02');
    expect(p.pace).toBeNull();
    expect(p.current).toBe(3); // 6×0.5 − 6×0.25 + 2×0.75
    expect(p.status).toBe('in_progress');
    expect(goalProgress(newGoal('net_pl', 'all', 1), trades, '2026-11-26').status).toBe('achieved');
  });
});

import { FLOW_FIELDS } from '../flow/flow';
import { createSuggestedConfig } from '../mapping/config';
import { evaluateMapping } from '../mapping/evaluate';
import type { SourceProperty } from '../source/types';
import { schemaFingerprint } from '../source/types';

describe('flow log mapping', () => {
  const P = (id: string, name: string, type: SourceProperty['type']): SourceProperty => ({ id, name, type, nativeType: type });
  const props = [P('t', 'Name', 'title'), P('d', 'Date', 'date'), P('tod', 'Time of Day', 'select'), P('f', 'Flow', 'number'), P('pf', 'Positive Flow', 'multi_select'), P('nf', 'Negative Flow', 'multi_select'), P('n', 'Notes', 'text')];
  it('maps a Flow Log database automatically', () => {
    const cfg = createSuggestedConfig({ id: 'fl', kind: 'notion', name: 'Flow Log', recordCount: 0 }, { datasetId: 'fl', properties: props, fingerprint: schemaFingerprint(props) }, FLOW_FIELDS, 'flow');
    const mapped = (k: string) => props.find((p) => p.id === cfg.entries[k].propertyId)?.name;
    expect([mapped('date'), mapped('flow_score'), mapped('time_of_day'), mapped('positive_flow_tags'), mapped('negative_flow_tags'), mapped('notes')]).toEqual(['Date', 'Flow', 'Time of Day', 'Positive Flow', 'Negative Flow', 'Notes']);
    expect(cfg.source.target).toBe('flow');
    expect(evaluateMapping(cfg, props, FLOW_FIELDS).canProceed).toBe(true);
  });
});
