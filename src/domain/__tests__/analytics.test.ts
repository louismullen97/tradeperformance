import { describe, expect, it } from 'vitest';
import { applyFilter, breakdown, dailyStats, monthGrid, performance, tagDifference } from '../analytics/analytics';
import { DIMENSIONS, getDimension, weekdayOf } from '../analytics/dimensions';
import type { StandardTrade } from '../trades/types';

let n = 0;
const t = (date: string, r: number, opt: Record<string, unknown> = {}, setup = 'A'): StandardTrade => ({
  id: `t${++n}`, trade_date: date, currency_pair: 'EURUSD', setup, risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: { profit_loss_amount: r * 250, ...opt } as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `t${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

describe('performance', () => {
  // Equity: +2, +1, -1(=2), -1(=1), +3(=4), 0, -1(=3)  peak 4 at end → max DD = 2 (from 3 to 1)
  const trades = [t('2026-01-01', 2), t('2026-01-02', -1), t('2026-01-03', 1), t('2026-01-04', -1), t('2026-01-05', 3), t('2026-01-06', 0), t('2026-01-07', -1)];
  // sorted by date: 2, -1, 1, -1, 3, 0, -1 → equity 2,1,2,1,4,4,3; peak 2 → dd 1; peak 4 → dd 1. max dd = 1
  it('computes drawdown, streaks and extremes', () => {
    const p = performance(trades);
    expect(p.maxDrawdownR).toBe(1);
    expect(p.currentDrawdownR).toBe(1);
    expect(p.longestWinStreak).toBe(1);
    expect(p.longestLossStreak).toBe(1);
    expect(p.bestTradeR).toBe(3);
    expect(p.worstTradeR).toBe(-1);
    expect(p.tradingDays).toBe(7);
  });
  it('counts streaks across breakevens', () => {
    const p = performance([t('2026-02-01', -1), t('2026-02-02', 0), t('2026-02-03', -1), t('2026-02-04', 2)]);
    expect(p.longestLossStreak).toBe(2);
    expect(p.maxDrawdownR).toBe(2);
  });
});

describe('breakdown & filter', () => {
  const trades = [
    t('2026-03-02', 2, { management_style: 'Intraday', account: 'CTI 100k, Leveraged 100k' }, '2 Touch'),
    t('2026-03-03', -1, { management_style: 'HTF Swing', account: 'CTI 100k' }, '2 Touch'),
    t('2026-03-04', 3, { management_style: 'HTF Swing' }, 'V-Shape'),
  ];
  it('groups by dimension and counts multi-valued fields in each group', () => {
    const rows = breakdown(trades, getDimension('setup'));
    expect(rows.map((r) => [r.value, r.stats.count, r.stats.netR])).toEqual([['2 Touch', 2, 1], ['V-Shape', 1, 3]]);
    const accounts = breakdown(trades, getDimension('account'));
    expect(accounts.find((r) => r.value === 'CTI 100k')?.stats.count).toBe(2);
    expect(accounts.find((r) => r.value === 'Leveraged 100k')?.stats.count).toBe(1);
  });
  it('filters by dimension and date range', () => {
    expect(applyFilter(trades, { dims: { management_style: 'HTF Swing' } }, DIMENSIONS)).toHaveLength(2);
    expect(applyFilter(trades, { dims: {}, from: '2026-03-03', to: '2026-03-03' }, DIMENSIONS)).toHaveLength(1);
  });
  it('orders weekdays Monday-first', () => {
    expect(weekdayOf('2026-11-23')).toBe('Monday');
    expect(breakdown(trades, getDimension('weekday')).map((r) => r.value)).toEqual(['Monday', 'Tuesday', 'Wednesday']);
  });
});

describe('calendar', () => {
  it('aggregates by day', () => {
    const d = dailyStats([t('2026-11-24', 3), t('2026-11-24', -1), t('2026-11-25', 0)]);
    expect(d.get('2026-11-24')).toMatchObject({ count: 2, netR: 2, wins: 1, losses: 1, netAmount: 500 });
    expect(d.get('2026-11-25')?.netR).toBe(0);
  });
  it('builds Monday-first month grids', () => {
    const g = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(g[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });
});

describe('tag difference', () => {
  const trades = [
    t('2026-01-01', 2, { positive_tags: ['HTF trend'] }),
    t('2026-01-02', 3, { positive_tags: ['HTF trend'] }),
    t('2026-01-03', 1, {}),
    t('2026-01-04', -1, { negative_tags: ['impulsive'] }),
    t('2026-01-05', -1, { negative_tags: ['impulsive'], positive_tags: ['HTF trend'] }),
  ];
  const rows = tagDifference(trades, [{ key: 'positive_tags', label: 'Positive' }, { key: 'negative_tags', label: 'Negative' }]);
  it('compares how often tags appear on winners vs losers', () => {
    const impulsive = rows.find((r) => r.tag === 'impulsive')!;
    expect(impulsive).toMatchObject({ trades: 2, inWins: 0, inLosses: 1, difference: -1, winRateWith: 0, lowSample: true });
    const htf = rows.find((r) => r.tag === 'HTF trend')!;
    expect(htf.inWins).toBeCloseTo(2 / 3, 3);
    expect(htf.inLosses).toBe(0.5);
    expect(htf.winRateWith).toBeCloseTo(2 / 3, 3);
    expect(htf.winRateWithout).toBe(0.5);
  });
  it('sorts by the size of the difference', () => {
    expect(rows[0].tag).toBe('impulsive');
  });
});
