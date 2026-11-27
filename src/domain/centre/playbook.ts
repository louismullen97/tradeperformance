import type { FieldDefinition } from '../fields/types';
import type { SourceKind } from '../source/types';
import type { TradeRepository } from '../trades/repository';
import type { StandardTrade } from '../trades/types';

/** Playbook: one entry per setup, with the strategy it belongs to and its rules. */
export interface PlaybookEntry {
  id: string;
  setup: string;
  strategy: string | null;
  status: string | null;
  timeframes: string[];
  sessions: string[];
  entryRules: string | null;
  invalidation: string | null;
  source: { kind: SourceKind; datasetId: string; datasetName: string; recordId: string; recordUrl?: string };
}

const list = (key: string, label: string, aliases: string[]): FieldDefinition => ({ key, label, description: label, required: false, valueKind: 'string_list', group: 'context', aliases, example: '' });
const text = (key: string, label: string, aliases: string[]): FieldDefinition => ({ key, label, description: label, required: false, valueKind: 'string', group: 'meta', aliases, example: '' });

export const PLAYBOOK_FIELDS: readonly FieldDefinition[] = [
  { key: 'setup', label: 'Setup', description: 'Setup name — must match the Setup in your journal.', required: true, valueKind: 'string', group: 'core', aliases: ['Setup', 'Name', 'Setup Name', 'Pattern', 'Model'], example: '3 Touch' },
  { key: 'strategy', label: 'Strategy', description: 'The strategy the setup belongs to.', required: true, valueKind: 'string', group: 'core', aliases: ['Strategy', 'System', 'Methodology', 'Playbook'], example: 'Falcon' },
  text('status', 'Status', ['Status', 'State', 'Active']),
  list('timeframes', 'Timeframes', ['Timeframes', 'Timeframe', 'TF']),
  list('sessions', 'Sessions', ['Sessions', 'Session', 'Killzones', 'Killzone']),
  text('entry_rules', 'Entry rules', ['Entry rules', 'Entry Criteria', 'Rules', 'Criteria']),
  text('invalidation', 'Invalidation', ['Invalidation', 'Invalidations', 'Exit Rules', 'Stop Rules']),
];

export interface PlaybookRepository {
  list(): Promise<PlaybookEntry[]>;
  replaceDataset(datasetId: string, entries: PlaybookEntry[]): Promise<void>;
}

const KEY = 'tradelens.playbook.v1';

export class LocalStoragePlaybookRepository implements PlaybookRepository {
  private entries: PlaybookEntry[] = [];
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    try {
      this.entries = JSON.parse(this.storage?.getItem(KEY) ?? '[]') as PlaybookEntry[];
    } catch {
      this.entries = [];
    }
  }
  async list() {
    return this.entries;
  }
  async replaceDataset(datasetId: string, entries: PlaybookEntry[]) {
    this.entries = [...this.entries.filter((e) => e.source.datasetId !== datasetId), ...entries];
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      /* storage unavailable */
    }
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Fill each trade's strategy from the Playbook when the journal doesn't record one. */
export function applyPlaybook(trades: StandardTrade[], entries: PlaybookEntry[]): StandardTrade[] {
  const bySetup = new Map(entries.filter((e) => e.strategy).map((e) => [norm(e.setup), e.strategy!]));
  if (!bySetup.size) return trades;
  return trades.map((t) => {
    const has = t.optional.strategy;
    if ((typeof has === 'string' && has.trim()) || !bySetup.has(norm(t.setup))) return t;
    return { ...t, optional: { ...t.optional, strategy: bySetup.get(norm(t.setup))! } };
  });
}

/** A trade repository whose reads carry Playbook strategies. Writes pass straight through. */
export function withPlaybook(repo: TradeRepository, playbook: PlaybookRepository): TradeRepository {
  return {
    // Don't persist strategies that only came from the Playbook, so later Playbook edits still apply.
    upsertMany: async (trades) => {
      const raw = new Map((await repo.list()).map((t) => [t.id, t]));
      return repo.upsertMany(
        trades.map((t) => {
          const stored = raw.get(t.id);
          if (!stored || stored.optional.strategy || !t.optional.strategy) return t;
          const { strategy: _derived, ...rest } = t.optional;
          return { ...t, optional: rest };
        }),
      );
    },
    list: async () => applyPlaybook(await repo.list(), await playbook.list()),
    count: () => repo.count(),
    removeDataset: (id) => repo.removeDataset(id),
  };
}
