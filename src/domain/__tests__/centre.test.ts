import { describe, expect, it } from 'vitest';
import { periodRange } from '../analytics/review';
import { dayRows, discipline, opportunityGaps, repeatableTags, subPanels, tradeQuality } from '../review/centre';
import { emptyDaily, LocalStorageDailyRepository, type DailyReview } from '../review/daily';
import type { StandardTrade } from '../trades/types';

let n = 0;
const t = (date: string, r: number, opt: Record<string, unknown> = {}): StandardTrade => ({
  id: `c${++n}`, trade_date: date, currency_pair: 'EURUSD', setup: '3 Touch', risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: opt as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `c${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});
const d = (date: string, perf: number, patch: Partial<DailyReview> = {}): DailyReview => ({ ...emptyDaily(date), performanceScore: perf, updatedAt: '2026-11-01T00:00:00Z', ...patch });

// Week of Mon 16 – Sun 22 Nov 2026
const week = periodRange('week', '2026-11-18');
const trades = [
  t('2026-11-16', 2, { positive_tags: ['Patient'] }),
  t('2026-11-17', -1, { negative_tags: ['Early entry'] }),
  t('2026-11-17', -1, { negative_tags: ['Early entry'] }),
  t('2026-11-19', 3, { positive_tags: ['Patient'] }),
  t('2026-11-21', 1), // Saturday trade
];
const reviews = [
  d('2026-11-16', 8, { wins: ['Followed my plan'] }),
  d('2026-11-17', 4, { mistakes: ['Overtraded'] }),
  d('2026-11-19', 9, { wins: ['Followed my plan'] }),
];

describe('Review Centre', () => {
  const rows = dayRows(week, trades, reviews, [{ id: 'f', date: '2026-11-18', score: 6, timeOfDay: null, positive: [], negative: [], notes: null, source: { kind: 'notion', datasetId: 'f', datasetName: 'F', recordId: 'f' } }]);
  it('lists weekdays plus traded weekend days, with flow from the Flow Log as fallback', () => {
    expect(rows.map((r) => r.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    expect(rows[2].flowScore).toBe(6);
    expect(rows[1].stats.netR).toBe(-2);
  });
  it('measures discipline and whether good execution lines up with green days', () => {
    const disc = discipline(rows, '2026-11-22');
    expect(disc).toMatchObject({ logged: 3, days: 6, avgPerformance: 7, performanceOnGreen: 8.5, performanceOnRed: 4, winsCount: 2, mistakesCount: 1 });
    expect(disc.cleanRate).toBeCloseTo(2 / 3);
  });
  it('splits good trades from trades with mistakes', () => {
    expect(tradeQuality(trades)).toEqual({ good: { count: 2, netR: 5 }, mistakes: { count: 2, netR: -2 }, untagged: { count: 1, netR: 1 } });
  });
  it('finds repeatable tags with the R attached', () => {
    const tags = repeatableTags(trades, rows, 2);
    expect(tags.find((x) => x.tag === 'Patient')).toMatchObject({ kind: 'Trade · positive', count: 2, netR: 5 });
    expect(tags.find((x) => x.tag === 'Followed my plan')).toMatchObject({ kind: 'Day · win', count: 2, netR: 5 });
  });
  it('builds week panels for a month', () => {
    const panels = subPanels('month', periodRange('month', '2026-11-10'), trades, reviews, [], '2026-11-30');
    expect(panels.map((p) => `${p.label} ${p.range.start}`)).toEqual(['Week 1 2026-11-02', 'Week 2 2026-11-09', 'Week 3 2026-11-16', 'Week 4 2026-11-23']);
    expect(panels[2]).toMatchObject({ topWin: 'Followed my plan', avgPerformance: 7 });
    expect(panels[2].perf.netR).toBe(4);
    // A month starting on Thursday keeps that week.
    expect(subPanels('month', periodRange('month', '2026-10-10'), [], []).map((p) => p.range.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('reports opportunity gaps', () => {
    const g = opportunityGaps(trades, [t('2026-11-18', 2.5, { trade_status: 'missed' })], rows, '2026-11-22');
    expect(g).toMatchObject({ missedWinners: 1, missedWinnersR: 2.5, mistakeTrades: 2, mistakeTradesR: -2, unloggedDays: 3 });
    expect(g.costliestMistake?.tag).toBe('Early entry');
  });
});

describe('daily repository', () => {
  it('keeps the newer copy when an import meets a local edit', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;
    const repo = new LocalStorageDailyRepository(storage);
    await repo.save(d('2026-11-16', 9, { updatedAt: '2026-11-20T00:00:00Z' }));
    await repo.upsertMany([d('2026-11-16', 5, { updatedAt: '2026-11-17T00:00:00Z' }), d('2026-11-17', 6)]);
    expect((await repo.get('2026-11-16'))?.performanceScore).toBe(9);
    expect((await new LocalStorageDailyRepository(storage).list()).map((x) => x.date)).toEqual(['2026-11-16', '2026-11-17']);
  });
});

import { DAILY_FIELDS } from '../review/daily';
import { createSuggestedConfig } from '../mapping/config';
import type { SourceProperty } from '../source/types';
import { schemaFingerprint } from '../source/types';

describe('Daily ASR mapping', () => {
  it('maps the Notion Daily ASR database automatically', () => {
    const P = (id: string, name: string, type: SourceProperty['type']): SourceProperty => ({ id, name, type, nativeType: type });
    const props = [P('n', 'Name', 'title'), P('d', 'Date', 'date'), P('p', 'Performance', 'number'), P('f', 'Flow', 'number'), P('w', 'Wins', 'multi_select'), P('m', 'Mistakes', 'multi_select'), P('e', 'Emotions', 'multi_select'), P('o', 'Observations', 'text'), P('c', 'Decisions', 'text'), P('l', 'Lesson', 'text')];
    const cfg = createSuggestedConfig({ id: 'da', kind: 'notion', name: 'Daily ASR', recordCount: 0 }, { datasetId: 'da', properties: props, fingerprint: schemaFingerprint(props) }, DAILY_FIELDS, 'daily');
    const name = (k: string) => props.find((p) => p.id === cfg.entries[k].propertyId)?.name;
    expect(DAILY_FIELDS.map((f) => name(f.key))).toEqual(['Date', 'Performance', 'Flow', 'Wins', 'Mistakes', 'Emotions', 'Observations', 'Decisions', 'Lesson']);
  });
});
