import { describe, expect, it } from 'vitest';
import { psychologyBreakdown, ratingBreakdown, ratingByOutcome } from '../analytics/psychology';
import { periodRange, shiftPeriod } from '../analytics/review';
import type { StandardTrade } from '../trades/types';

let n = 0;
const t = (r: number, opt: Record<string, unknown>): StandardTrade => ({
  id: `p${++n}`, trade_date: '2026-11-02', currency_pair: 'EURUSD', setup: 'A', risk_percentage: 0.25, result_r: r,
  profit_loss_percentage: r * 0.25, optional: opt as StandardTrade['optional'],
  source: { kind: 'notion', datasetId: 'ds', datasetName: 'J', recordId: `p${n}`, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

describe('review periods', () => {
  it('computes week, month and quarter ranges', () => {
    expect(periodRange('week', '2026-11-26')).toMatchObject({ start: '2026-11-23', end: '2026-11-29' });
    expect(periodRange('month', '2026-11-26')).toMatchObject({ start: '2026-11-01', end: '2026-11-30', label: 'November 2026' });
    expect(periodRange('quarter', '2026-11-26')).toMatchObject({ start: '2026-10-01', end: '2026-12-31', label: 'Q4 2026' });
  });
  it('shifts across year boundaries', () => {
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(periodRange('quarter', shiftPeriod('quarter', '2026-02-10', -1)).label).toBe('Q4 2025');
    expect(shiftPeriod('week', '2026-11-26', 1)).toBe('2026-11-30');
  });
});

describe('psychology', () => {
  const trades = [
    t(2, { psychology_tags: ['Felt calm'], execution_rating: 5 }),
    t(1.5, { psychology_tags: ['Felt calm'], execution_rating: 4 }),
    t(-1, { psychology_tags: ['FOMO'], execution_rating: 2 }),
    t(2, { psychology_tags: ['Fear of losing'], trade_status: 'missed' }),
    t(3, { psychology_tags: ['Fear of losing'], trade_status: 'missed' }),
    t(-1, { psychology_tags: ['Fear of losing', 'FOMO'], execution_rating: 3 }),
  ];
  it('counts wins, losses and missed per tag', () => {
    const rows = psychologyBreakdown(trades);
    const fear = rows.find((r) => r.tag === 'Fear of losing')!;
    expect(fear).toMatchObject({ taken: 1, losses: 1, missed: 2 });
    expect(fear.missedShare).toBeCloseTo(2 / 3);
    expect(rows.find((r) => r.tag === 'Felt calm')).toMatchObject({ wins: 2, winRate: 1, avgR: 1.75 });
  });
  it('relates execution rating to outcome', () => {
    expect(ratingBreakdown(trades).map((r) => r.rating)).toEqual([5, 4, 3, 2]);
    expect(ratingByOutcome(trades)).toEqual({ wins: 4.5, losses: 2.5 });
  });
});
