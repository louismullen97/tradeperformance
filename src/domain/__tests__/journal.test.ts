import { describe, expect, it } from 'vitest';
import { InMemoryTradeRepository, LocalStorageTradeRepository } from '../trades/repository';
import { cumulativeR, summarise } from '../trades/summary';
import type { StandardTrade } from '../trades/types';

const trade = (id: string, date: string, r: number, pl = r, datasetId = 'ds'): StandardTrade => ({
  id, trade_date: date, currency_pair: 'EURUSD', setup: 'A', risk_percentage: 1, result_r: r, profit_loss_percentage: pl,
  optional: {},
  source: { kind: 'notion', datasetId, datasetName: 'J', recordId: id, mappingConfigId: 'm', batchId: 'b', importedAt: '', originalValues: {} },
});

describe('summarise', () => {
  it('computes win rate excluding breakevens, net R and profit factor', () => {
    const s = summarise([trade('1', '2026-01-01', 2), trade('2', '2026-01-02', -1), trade('3', '2026-01-03', 0), trade('4', '2026-01-04', 3)]);
    expect(s).toMatchObject({ count: 4, wins: 2, losses: 1, breakeven: 1, winRate: 0.6667, netR: 4, avgR: 1, avgWinR: 2.5, avgLossR: -1, profitFactor: 5 });
  });
  it('handles an empty journal', () => {
    expect(summarise([])).toMatchObject({ count: 0, winRate: null, avgR: null, profitFactor: null, netR: 0 });
  });
  it('builds a cumulative R series in date order', () => {
    expect(cumulativeR([trade('b', '2026-01-02', -1), trade('a', '2026-01-01', 2)]).map((p) => p.r)).toEqual([2, 1]);
  });
});

describe('trade repositories', () => {
  it('upserts by id and removes by dataset', async () => {
    const repo = new InMemoryTradeRepository();
    expect(await repo.upsertMany([trade('1', 'd', 1), trade('2', 'd', 1, 1, 'other')])).toEqual({ inserted: 2, updated: 0 });
    expect(await repo.upsertMany([trade('1', 'd', 2)])).toEqual({ inserted: 0, updated: 1 });
    expect(await repo.removeDataset('ds')).toBe(1);
    expect(await repo.count()).toBe(1);
  });
  it('persists to storage and reloads', async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    await new LocalStorageTradeRepository(storage).upsertMany([trade('1', '2026-01-01', 1.5)]);
    const reloaded = await new LocalStorageTradeRepository(storage).list();
    expect(reloaded.map((t) => t.result_r)).toEqual([1.5]);
  });
});
