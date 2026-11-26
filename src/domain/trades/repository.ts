import type { StandardTrade } from './types';

/**
 * Store for standardised trades. Trades are keyed by their deterministic id
 * (`kind:datasetId:recordId`), so re-importing the same source updates rather
 * than duplicates. localStorage is a stand-in until there's a backend.
 */
export interface TradeRepository {
  upsertMany(trades: StandardTrade[]): Promise<{ inserted: number; updated: number }>;
  list(): Promise<StandardTrade[]>;
  count(): Promise<number>;
  /** Remove every trade imported from one source dataset. */
  removeDataset(datasetId: string): Promise<number>;
}

export class InMemoryTradeRepository implements TradeRepository {
  protected trades = new Map<string, StandardTrade>();

  async upsertMany(trades: StandardTrade[]) {
    let inserted = 0;
    let updated = 0;
    for (const t of trades) {
      if (this.trades.has(t.id)) updated++;
      else inserted++;
      this.trades.set(t.id, t);
    }
    this.persist();
    return { inserted, updated };
  }

  async list() {
    return [...this.trades.values()];
  }

  async count() {
    return this.trades.size;
  }

  async removeDataset(datasetId: string) {
    let removed = 0;
    for (const [id, t] of this.trades) {
      if (t.source.datasetId === datasetId) {
        this.trades.delete(id);
        removed++;
      }
    }
    this.persist();
    return removed;
  }

  protected persist() {}
}

const KEY = 'tradelens.trades.v1';

export class LocalStorageTradeRepository extends InMemoryTradeRepository {
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    super();
    try {
      const raw = this.storage?.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as StandardTrade[]) : [];
      for (const t of parsed) this.trades.set(t.id, t);
    } catch {
      /* unreadable or unavailable storage — start empty */
    }
  }

  protected override persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.trades.values()]));
    } catch {
      /* quota or private mode — trades stay in memory for this session */
    }
  }
}
