import { describe, expect, it } from 'vitest';
import { dimensionHighlights, dailyEquity } from '../analytics/analytics';
import { getDimension } from '../analytics/dimensions';
import { goalProgress, newGoal, periodBounds } from '../goals/goals';
import { isMissed, missedOnly, takenOnly } from '../trades/status';
import type { StandardTrade } from '../trades/types';

let n = 0;
const t = (date: string, r: number, setup = 'A', opt: Record<string, unknown> = {}): StandardTrade => ({
  id: `g${++n}`, trade_date: date, currency_pair: 'EURUSD', setup, risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: opt as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `g${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

describe('goal periods', () => {
  it('uses Monday-start weeks and calendar months', () => {
    expect(periodBounds('week', '2026-11-26')).toEqual({ start: '2026-11-23', end: '2026-11-29' });
    expect(periodBounds('month', '2026-11-26')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });
});

describe('goal progress', () => {
  // November 2026: 21 weekdays. By Wed 11 Nov, 8 weekdays have elapsed.
  const trades = [t('2026-11-02', 2), t('2026-11-03', -1), t('2026-11-09', 3), t('2026-11-09', 1), t('2026-10-30', 5)];
  it('tracks cumulative goals against a weekday pace', () => {
    const p = goalProgress(newGoal('net_r', 'month', 21), trades, '2026-11-11');
    expect(p.current).toBe(5); // October trade excluded
    expect(p.pace).toBe(8);
    expect(p.status).toBe('behind');
    expect(p.series.find((s) => s.date === '2026-11-09')?.actual).toBe(5);
    expect(p.series.find((s) => s.date === '2026-11-20')?.actual).toBeNull();
    expect(p.series[p.series.length - 1].target).toBe(21);
  });
  it('counts trading days and marks achieved', () => {
    expect(goalProgress(newGoal('trading_days', 'month', 3), trades, '2026-11-11')).toMatchObject({ current: 3, status: 'achieved', ratio: 1 });
  });
  it('checks consistency as best day share of profit (lower is better)', () => {
    // Day profits: +2, -1, +4 → total 5, best 4 → 80%
    const p = goalProgress(newGoal('consistency', 'month', 30), trades, '2026-11-11');
    expect(p.current).toBe(80);
    expect(p.status).toBe('breached');
    expect(goalProgress(newGoal('consistency', 'month', 90), trades, '2026-11-11').status).toBe('on_track');
  });
  it('reports no data for an empty period', () => {
    expect(goalProgress(newGoal('win_rate', 'week', 50), trades, '2026-12-15').status).toBe('no_data');
  });
});

describe('highlights and status', () => {
  const trades = [t('2026-01-01', 3, 'V-Shape'), t('2026-01-02', -1, '2 Touch'), t('2026-01-03', -1, '2 Touch'), t('2026-01-04', 1, '3 Touch'), t('2026-01-05', 1, '3 Touch'), t('2026-01-06', 1, '3 Touch')];
  it('finds best, worst, most and least frequent', () => {
    const h = dimensionHighlights(trades, getDimension('setup'));
    expect(h.best?.value).toBe('V-Shape'); // +3R beats +3R? tie broken by expectancy (3 vs 1)
    expect(h.worst?.value).toBe('2 Touch');
    expect(h.mostFrequent?.value).toBe('3 Touch');
    expect(h.leastFrequent?.value).toBe('V-Shape');
  });
  it('builds end-of-day cumulative equity', () => {
    expect(dailyEquity([t('2026-02-01', 2), t('2026-02-01', -1), t('2026-02-02', 1)]).map((p) => p.r)).toEqual([1, 2]);
  });
  it('separates missed from taken trades', () => {
    const all = [t('2026-03-01', 1), t('2026-03-02', 2, 'A', { trade_status: 'missed' }), t('2026-03-03', 1, 'A', { trade_status: 'taken' })];
    expect(isMissed(all[1])).toBe(true);
    expect(takenOnly(all)).toHaveLength(2);
    expect(missedOnly(all)).toHaveLength(1);
  });
});
