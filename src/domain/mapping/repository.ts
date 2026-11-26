import type { SourceKind } from '../source/types';
import type { MappingConfig } from './types';

/**
 * Persistence for mapping configs. The localStorage implementation is a
 * stand-in; a server-backed implementation will satisfy the same interface.
 */
export interface MappingConfigRepository {
  find(kind: SourceKind, datasetId: string): Promise<MappingConfig | null>;
  save(config: MappingConfig): Promise<void>;
  remove(kind: SourceKind, datasetId: string): Promise<void>;
  listDatasetIds(kind: SourceKind): Promise<string[]>;
}

const PREFIX = 'tradelens.mapping.v1';
const key = (kind: SourceKind, datasetId: string) => `${PREFIX}:${kind}:${datasetId}`;

export class LocalStorageMappingRepository implements MappingConfigRepository {
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {}

  async find(kind: SourceKind, datasetId: string) {
    try {
      const raw = this.storage?.getItem(key(kind, datasetId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MappingConfig;
      return parsed.schemaVersion === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(config: MappingConfig) {
    try {
      this.storage?.setItem(key(config.source.kind, config.source.datasetId), JSON.stringify(config));
    } catch {
      /* storage unavailable (private mode, quota) — mapping still works for this session */
    }
  }

  async remove(kind: SourceKind, datasetId: string) {
    try {
      this.storage?.removeItem(key(kind, datasetId));
    } catch {
      /* ignore */
    }
  }

  async listDatasetIds(kind: SourceKind) {
    const ids: string[] = [];
    try {
      const prefix = `${PREFIX}:${kind}:`;
      for (let i = 0; i < (this.storage?.length ?? 0); i++) {
        const k = this.storage!.key(i);
        if (k?.startsWith(prefix)) ids.push(k.slice(prefix.length));
      }
    } catch {
      /* ignore */
    }
    return ids;
  }
}

export class InMemoryMappingRepository implements MappingConfigRepository {
  private readonly store = new Map<string, MappingConfig>();
  async find(kind: SourceKind, datasetId: string) {
    return this.store.get(key(kind, datasetId)) ?? null;
  }
  async save(config: MappingConfig) {
    this.store.set(key(config.source.kind, config.source.datasetId), structuredClone(config));
  }
  async remove(kind: SourceKind, datasetId: string) {
    this.store.delete(key(kind, datasetId));
  }
  async listDatasetIds(kind: SourceKind) {
    return [...this.store.values()].filter((c) => c.source.kind === kind).map((c) => c.source.datasetId);
  }
}
