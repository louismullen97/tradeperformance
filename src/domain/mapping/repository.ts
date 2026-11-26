import type { SourceKind } from '../source/types';
import type { MappingConfig } from './types';

/**
 * Persistence for mapping configs. The localStorage implementation is a
 * stand-in; a server-backed implementation will satisfy the same interface.
 */
export interface MappingConfigRepository {
  find(kind: SourceKind, datasetId: string, target?: string): Promise<MappingConfig | null>;
  save(config: MappingConfig): Promise<void>;
  remove(kind: SourceKind, datasetId: string, target?: string): Promise<void>;
  listDatasetIds(kind: SourceKind, target?: string): Promise<string[]>;
}

const PREFIX = 'tradelens.mapping.v1';
/** Trades keep the original key so saved mappings survive; other targets are namespaced. */
const key = (kind: SourceKind, datasetId: string, target?: string) =>
  !target || target === 'trades' ? `${PREFIX}:${kind}:${datasetId}` : `${PREFIX}:${kind}:${target}~${datasetId}`;

export class LocalStorageMappingRepository implements MappingConfigRepository {
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {}

  async find(kind: SourceKind, datasetId: string, target?: string) {
    try {
      const raw = this.storage?.getItem(key(kind, datasetId, target));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MappingConfig;
      return parsed.schemaVersion === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(config: MappingConfig) {
    try {
      this.storage?.setItem(key(config.source.kind, config.source.datasetId, config.source.target), JSON.stringify(config));
    } catch {
      /* storage unavailable (private mode, quota) — mapping still works for this session */
    }
  }

  async remove(kind: SourceKind, datasetId: string, target?: string) {
    try {
      this.storage?.removeItem(key(kind, datasetId, target));
    } catch {
      /* ignore */
    }
  }

  async listDatasetIds(kind: SourceKind, target?: string) {
    const ids: string[] = [];
    try {
      const prefix = `${PREFIX}:${kind}:`;
      const ns = target && target !== 'trades' ? `${target}~` : '';
      for (let i = 0; i < (this.storage?.length ?? 0); i++) {
        const k = this.storage!.key(i);
        if (!k?.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (ns ? rest.startsWith(ns) : !rest.includes('~')) ids.push(rest.slice(ns.length));
      }
    } catch {
      /* ignore */
    }
    return ids;
  }
}

export class InMemoryMappingRepository implements MappingConfigRepository {
  private readonly store = new Map<string, MappingConfig>();
  async find(kind: SourceKind, datasetId: string, target?: string) {
    return this.store.get(key(kind, datasetId, target)) ?? null;
  }
  async save(config: MappingConfig) {
    this.store.set(key(config.source.kind, config.source.datasetId, config.source.target), structuredClone(config));
  }
  async remove(kind: SourceKind, datasetId: string, target?: string) {
    this.store.delete(key(kind, datasetId, target));
  }
  async listDatasetIds(kind: SourceKind, target?: string) {
    const t = target && target !== 'trades' ? target : undefined;
    return [...this.store.values()].filter((c) => c.source.kind === kind && c.source.target === t).map((c) => c.source.datasetId);
  }
}
