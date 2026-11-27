import { describe, expect, it } from 'vitest';
import { detectRoles } from '../centre/detect';
import { PLAYBOOK_FIELDS } from '../centre/playbook';
import { TRADE_FIELDS } from '../fields/registry';
import { FLOW_FIELDS } from '../flow/flow';
import { DAILY_FIELDS, PLAN_FIELDS } from '../review/daily';
import type { SourceProperty } from '../source/types';
import { schemaFingerprint } from '../source/types';

type T = SourceProperty['type'];
const db = (name: string, props: [string, T][]) => {
  const properties = props.map(([n, type], i): SourceProperty => ({ id: `${name}-${i}`, name: n, type, nativeType: type }));
  return { dataset: { id: name, kind: 'notion' as const, name, recordCount: 0 }, schema: { datasetId: name, properties, fingerprint: schemaFingerprint(properties) } };
};

const FIELDS = { trades: TRADE_FIELDS, daily: DAILY_FIELDS, flow: FLOW_FIELDS, plans: PLAN_FIELDS, playbook: PLAYBOOK_FIELDS };

describe('Trading Centre detection', () => {
  const inputs = [
    db('2027 Trade Journal', [['Name', 'title'], ['Date', 'date'], ['Pair', 'select'], ['Setup', 'select'], ['Risk %', 'number'], ['R', 'number'], ['P/L %', 'number'], ['PnL', 'number'], ['Direction', 'select'], ['Timeframe', 'select'], ['Session', 'select'], ['Positive tags', 'multi_select'], ['Negative tags', 'multi_select'], ['Psychology', 'multi_select'], ['Status', 'select']]),
    db('Daily ASR', [['Name', 'title'], ['Date', 'date'], ['Performance', 'number'], ['Flow', 'number'], ['Wins', 'multi_select'], ['Mistakes', 'multi_select'], ['Emotions', 'multi_select'], ['Observations', 'text'], ['Decisions', 'text'], ['Lesson', 'text']]),
    db('Flow Log', [['Name', 'title'], ['Date', 'date'], ['Time of Day', 'select'], ['Flow', 'number'], ['Positive Flow', 'multi_select'], ['Negative Flow', 'multi_select'], ['Notes', 'text']]),
    db('Plans', [['Name', 'title'], ['Type', 'select'], ['Period', 'date'], ['Status', 'select'], ['Notes', 'text']]),
    db('Playbook', [['Setup', 'title'], ['Strategy', 'select'], ['Status', 'select'], ['Timeframes', 'multi_select'], ['Sessions', 'multi_select'], ['Entry rules', 'text'], ['Invalidation', 'text'], ['Screenshots', 'files']]),
    db('Reviews', [['Name', 'title'], ['Period', 'select'], ['Date', 'date'], ['Net R', 'number'], ['Win rate', 'number'], ['Trades', 'number'], ['P/L %', 'number']]),
    db('Missed Trades', [['Name', 'title'], ['Date', 'date'], ['Pairs', 'select'], ['Direction', 'select'], ['PNL(potential)', 'number'], ['Session', 'select'], ['Positive tags', 'multi_select'], ['Rating(1-5)', 'number']]),
  ];
  const result = detectRoles(inputs, FIELDS);
  it('assigns every Trading Centre database its role', () => {
    expect(Object.fromEntries(result.map((d) => [d.dataset.name, d.role]))).toEqual({
      '2027 Trade Journal': 'trades',
      'Daily ASR': 'daily',
      'Flow Log': 'flow',
      Plans: 'plans',
      Playbook: 'playbook',
      Reviews: 'reviews',
      'Missed Trades': null,
    });
  });
  it('returns ready-to-use mappings', () => {
    const daily = result.find((d) => d.role === 'daily')!;
    expect(daily.candidate?.ready).toBe(true);
    expect(daily.candidate?.config?.source.target).toBe('daily');
  });
});

import { applyPlaybook, type PlaybookEntry } from '../centre/playbook';
import { createPlanTarget } from '../import/targets';
import { LocalStoragePlanRepository } from '../review/daily';
import { createSuggestedConfig } from '../mapping/config';
import { validateRecords } from '../validation/validate';
import type { StandardTrade } from '../trades/types';
import { getDimension } from '../analytics/dimensions';
import { planProperties } from '../../../server/notion/plans';
import type { NotionDataSource } from '../../sources/notion/types';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
};

describe('Playbook strategies', () => {
  const trade = (setup: string, strategy?: string): StandardTrade => ({
    id: setup, trade_date: '2026-11-02', currency_pair: 'EURUSD', setup, risk_percentage: 0.25, result_r: 1, profit_loss_percentage: 0.25,
    optional: strategy ? { strategy } : {},
    source: { kind: 'notion', datasetId: 'd', datasetName: 'J', recordId: setup, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
  });
  const entry = (setup: string, strategy: string): PlaybookEntry => ({ id: setup, setup, strategy, status: 'Active', timeframes: [], sessions: [], entryRules: null, invalidation: null, source: { kind: 'notion', datasetId: 'p', datasetName: 'Playbook', recordId: setup } });
  it('fills strategy from the playbook by setup name, keeping any the journal recorded', () => {
    const out = applyPlaybook([trade('3 Touch'), trade('FVG', 'ICT'), trade('Unknown')], [entry('3 touch', 'Falcon'), entry('FVG', 'Falcon')]);
    expect(out.map((t) => getDimension('strategy').values(t))).toEqual([['Falcon'], ['ICT'], []]);
  });
});

describe('Plans', () => {
  const props = [db('Plans', [['Name', 'title'], ['Type', 'select'], ['Period', 'date'], ['Status', 'select']])][0];
  it('imports items into the right review period with their status', async () => {
    const repo = new LocalStoragePlanRepository(memory());
    const target = createPlanTarget(repo);
    const config = createSuggestedConfig(props.dataset, props.schema, target.fields, 'plans');
    const [title, type, period, status] = props.schema.properties.map((p) => p.id);
    const rec = (id: string, name: string, kind: string, date: string, st: string) => ({
      id, url: `https://notion.so/${id}`,
      values: { [title]: { kind: 'text' as const, text: name }, [type]: { kind: 'select' as const, name: kind }, [period]: { kind: 'date' as const, start: date, end: null }, [status]: { kind: 'select' as const, name: st } },
    });
    const report = validateRecords([rec('a', 'Max 2 trades a day', 'Commitment', '2026-11-25', 'Kept'), rec('b', 'Pass the funded challenge', 'Objective', '2026-11-10', 'Open')], props.schema.properties, config, target.fields);
    const result = await target.commit(report, {}, props.dataset, config);
    expect(result.imported).toBe(2);
    expect(repo.get('week:2026-11-23')).toEqual([{ id: 'n_a', text: 'Max 2 trades a day', status: 'kept', notion: { pageId: 'a', url: 'https://notion.so/a' } }]);
    expect(repo.get('quarter:2026-10-01').map((i) => i.text)).toEqual(['Pass the funded challenge']);
    // Re-importing after the item moved week replaces it rather than duplicating.
    await target.commit(validateRecords([rec('a', 'Max 2 trades a day', 'Commitment', '2026-12-01', 'Open')], props.schema.properties, config, target.fields), {}, props.dataset, config);
    expect(repo.get('week:2026-11-23')).toEqual([]);
    expect(repo.get('week:2026-11-30')[0].status).toBe('open');
  });
  it('writes plan items back with type, period and status', () => {
    const ds = { object: 'data_source', id: 'p', title: [], last_edited_time: '', properties: {
      Name: { id: 't', name: 'Name', type: 'title', title: {} }, Type: { id: 'k', name: 'Type', type: 'select', select: { options: [] } },
      Period: { id: 'd', name: 'Period', type: 'date', date: {} }, Status: { id: 's', name: 'Status', type: 'select', select: { options: [] } },
    } } as unknown as NotionDataSource;
    expect(planProperties(ds, { dataSourceId: 'p', item: { id: 'x', text: 'Journal daily', status: 'missed' }, period: 'month', start: '2026-11-01', end: '2026-11-30' })).toEqual({
      Name: { title: [{ type: 'text', text: { content: 'Journal daily' } }] },
      Type: { select: { name: 'Focus area' } },
      Period: { date: { start: '2026-11-01', end: '2026-11-30' } },
      Status: { select: { name: 'Missed' } },
    });
  });
});
