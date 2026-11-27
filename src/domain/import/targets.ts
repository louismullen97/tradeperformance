import { FLOW_FIELDS, type FlowEntry, type FlowRepository } from '../flow/flow';
import type { FieldDefinition } from '../fields/types';
import { DAILY_FIELDS, PLAN_FIELDS, periodOfKind, planKey, type DailyRepository, type DailyReview, type PlanItem, type PlanRepository, type PlanStatus } from '../review/daily';
import { periodRange } from '../analytics/review';
import { PLAYBOOK_FIELDS, type PlaybookEntry, type PlaybookRepository } from '../centre/playbook';
import { TRADE_FIELDS } from '../fields/registry';
import type { MappingConfig } from '../mapping/types';
import type { SourceDataset } from '../source/types';
import type { TradeRepository } from '../trades/repository';
import type { RecordValidation, ValidationReport } from '../validation/types';
import { buildImportBatch, canInclude, defaultDecision, type RecordDecision, type SkippedRecord } from './importService';

/**
 * What an import produces. The same mapping/validation pipeline feeds every
 * target; only the field registry, preview and final write differ.
 */
export type ImportTargetKey = 'trades' | 'flow' | 'daily' | 'plans' | 'playbook';

export interface PreviewColumn {
  key: string;
  label: string;
  format: 'date' | 'text' | 'risk' | 'r' | 'pct' | 'number';
}

export interface ImportResult {
  id: string;
  createdAt: string;
  imported: number;
  skippedInvalid: number;
  skippedByUser: number;
  total: number;
  skipped: SkippedRecord[];
  /** One standardised record, shown on the completion screen. */
  sample: unknown;
}

export interface ImportTarget {
  key: ImportTargetKey;
  label: string;
  description: string;
  /** Plural noun for counts, e.g. "trades". */
  noun: string;
  fields: readonly FieldDefinition[];
  preview: PreviewColumn[];
  /** Where to go after importing. */
  destination: { label: string; href: string };
  commit(report: ValidationReport, decisions: Record<string, RecordDecision>, dataset: SourceDataset, config: MappingConfig): Promise<ImportResult>;
}

export function createTradeTarget(repo: TradeRepository): ImportTarget {
  return {
    key: 'trades',
    label: 'Trade journal',
    description: 'Trades taken and missed — the source for the journal, performance and reviews.',
    noun: 'trades',
    fields: TRADE_FIELDS,
    preview: [
      { key: 'trade_date', label: 'Date', format: 'date' },
      { key: 'currency_pair', label: 'Pair', format: 'text' },
      { key: 'setup', label: 'Setup', format: 'text' },
      { key: 'risk_percentage', label: 'Risk', format: 'risk' },
      { key: 'result_r', label: 'Result', format: 'r' },
      { key: 'profit_loss_percentage', label: 'P/L', format: 'pct' },
    ],
    destination: { label: 'View journal', href: '#/journal' },
    async commit(report, decisions, dataset, config) {
      const batch = buildImportBatch(report, decisions, dataset, config, TRADE_FIELDS);
      await repo.upsertMany(batch.trades);
      return {
        id: batch.id,
        createdAt: batch.createdAt,
        imported: batch.counts.imported,
        skippedInvalid: batch.counts.skippedInvalid,
        skippedByUser: batch.counts.skippedByUser,
        total: batch.counts.total,
        skipped: batch.skipped,
        sample: batch.trades[0],
      };
    },
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function flowEntryFrom(r: RecordValidation, dataset: SourceDataset): FlowEntry {
  const v = r.values;
  return {
    id: `${dataset.kind}:${dataset.id}:${r.record.id}`,
    date: v.date as string,
    score: v.flow_score as number,
    timeOfDay: typeof v.time_of_day === 'string' ? v.time_of_day : null,
    positive: strings(v.positive_flow_tags),
    negative: strings(v.negative_flow_tags),
    notes: typeof v.notes === 'string' ? v.notes : null,
    source: { kind: dataset.kind, datasetId: dataset.id, datasetName: dataset.name, recordId: r.record.id, recordUrl: r.record.url },
  };
}

export function createFlowTarget(repo: FlowRepository): ImportTarget {
  return {
    key: 'flow',
    label: 'Flow log',
    description: 'Daily Flow Zone check-ins (score 1–10) and what lifted or drained your flow.',
    noun: 'check-ins',
    fields: FLOW_FIELDS,
    preview: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'time_of_day', label: 'Time of day', format: 'text' },
      { key: 'flow_score', label: 'Flow', format: 'number' },
    ],
    destination: { label: 'View Flow Zone', href: '#/psychology/flow' },
    async commit(report, decisions, dataset) {
      const entries: FlowEntry[] = [];
      const skipped: SkippedRecord[] = [];
      for (const r of report.records) {
        const decision = canInclude(r) ? (decisions[r.record.id] ?? defaultDecision(r)) : 'exclude';
        if (decision === 'exclude') {
          skipped.push({ recordId: r.record.id, recordUrl: r.record.url, status: r.status, reason: canInclude(r) ? 'user_excluded' : 'invalid', issues: r.issues.map((i) => i.message) });
        } else entries.push(flowEntryFrom(r, dataset));
      }
      await repo.upsertMany(entries);
      return {
        id: `imp_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        imported: entries.length,
        skippedInvalid: skipped.filter((s) => s.reason === 'invalid').length,
        skippedByUser: skipped.filter((s) => s.reason === 'user_excluded').length,
        total: report.records.length,
        skipped,
        sample: entries[0],
      };
    },
  };
}

const textOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function dailyReviewFrom(r: RecordValidation, dataset: SourceDataset): DailyReview {
  const v = r.values;
  return {
    date: v.date as string,
    performanceScore: numOrNull(v.performance_score),
    flowScore: numOrNull(v.flow_score),
    wins: strings(v.wins),
    mistakes: strings(v.mistakes),
    emotions: strings(v.emotions),
    observations: textOrNull(v.observations),
    decisions: textOrNull(v.decisions),
    lesson: textOrNull(v.lesson),
    updatedAt: r.record.lastEditedTime ?? new Date().toISOString(),
    source: { kind: dataset.kind, datasetId: dataset.id, datasetName: dataset.name, recordId: r.record.id, recordUrl: r.record.url },
  };
}

export function createDailyTarget(repo: DailyRepository): ImportTarget {
  return {
    key: 'daily',
    label: 'Daily ASR',
    description: 'One review per trading day: performance and flow scores, wins, mistakes, emotions and notes.',
    noun: 'daily reviews',
    fields: DAILY_FIELDS,
    preview: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'performance_score', label: 'Performance', format: 'number' },
      { key: 'flow_score', label: 'Flow', format: 'number' },
    ],
    destination: { label: 'Open Review Centre', href: '#/review/day' },
    async commit(report, decisions, dataset) {
      const entries: DailyReview[] = [];
      const skipped: SkippedRecord[] = [];
      for (const r of report.records) {
        const decision = canInclude(r) ? (decisions[r.record.id] ?? defaultDecision(r)) : 'exclude';
        if (decision === 'exclude') {
          skipped.push({ recordId: r.record.id, recordUrl: r.record.url, status: r.status, reason: canInclude(r) ? 'user_excluded' : 'invalid', issues: r.issues.map((i) => i.message) });
        } else entries.push(dailyReviewFrom(r, dataset));
      }
      await repo.upsertMany(entries);
      return {
        id: `imp_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        imported: entries.length,
        skippedInvalid: skipped.filter((s) => s.reason === 'invalid').length,
        skippedByUser: skipped.filter((s) => s.reason === 'user_excluded').length,
        total: report.records.length,
        skipped,
        sample: entries[0],
      };
    },
  };
}

/** Shared commit loop for targets that store one simple record per row. */
async function commitRows<T>(report: ValidationReport, decisions: Record<string, RecordDecision>, map: (r: RecordValidation) => T, store: (rows: T[]) => Promise<void> | void): Promise<ImportResult> {
  const rows: T[] = [];
  const skipped: SkippedRecord[] = [];
  for (const r of report.records) {
    const decision = canInclude(r) ? (decisions[r.record.id] ?? defaultDecision(r)) : 'exclude';
    if (decision === 'exclude') {
      skipped.push({ recordId: r.record.id, recordUrl: r.record.url, status: r.status, reason: canInclude(r) ? 'user_excluded' : 'invalid', issues: r.issues.map((i) => i.message) });
    } else rows.push(map(r));
  }
  await store(rows);
  return {
    id: `imp_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    imported: rows.length,
    skippedInvalid: skipped.filter((s) => s.reason === 'invalid').length,
    skippedByUser: skipped.filter((s) => s.reason === 'user_excluded').length,
    total: report.records.length,
    skipped,
    sample: rows[0],
  };
}

export function createPlanTarget(repo: PlanRepository): ImportTarget {
  return {
    key: 'plans',
    label: 'Plans',
    description: 'Weekly commitments, monthly focus areas and quarterly objectives.',
    noun: 'plan items',
    fields: PLAN_FIELDS,
    preview: [
      { key: 'text', label: 'Item', format: 'text' },
      { key: 'kind', label: 'Type', format: 'text' },
      { key: 'period_start', label: 'Period', format: 'date' },
      { key: 'status', label: 'Status', format: 'text' },
    ],
    destination: { label: 'Open Review Centre', href: '#/review/week' },
    commit: (report, decisions) =>
      commitRows(
        report,
        decisions,
        (r) => {
          const v = r.values;
          const period = periodOfKind(typeof v.kind === 'string' ? v.kind : null);
          const status = (['open', 'kept', 'missed'].includes(v.status as string) ? v.status : 'open') as PlanStatus;
          const item: PlanItem = { id: `n_${r.record.id}`, text: String(v.text), status, notion: { pageId: r.record.id, url: r.record.url } };
          return { key: planKey(period, periodRange(period, v.period_start as string).start), item };
        },
        (rows) => void repo.mergeImported(rows),
      ),
  };
}

export function createPlaybookTarget(repo: PlaybookRepository): ImportTarget {
  return {
    key: 'playbook',
    label: 'Playbook',
    description: 'Your setups and the strategy each belongs to — powers the Strategy breakdown.',
    noun: 'setups',
    fields: PLAYBOOK_FIELDS,
    preview: [
      { key: 'setup', label: 'Setup', format: 'text' },
      { key: 'strategy', label: 'Strategy', format: 'text' },
      { key: 'status', label: 'Status', format: 'text' },
    ],
    destination: { label: 'View performance by strategy', href: '#/performance/tags' },
    commit: (report, decisions, dataset) =>
      commitRows(
        report,
        decisions,
        (r): PlaybookEntry => {
          const v = r.values;
          return {
            id: `${dataset.kind}:${dataset.id}:${r.record.id}`,
            setup: String(v.setup),
            strategy: textOrNull(v.strategy),
            status: textOrNull(v.status),
            timeframes: strings(v.timeframes),
            sessions: strings(v.sessions),
            entryRules: textOrNull(v.entry_rules),
            invalidation: textOrNull(v.invalidation),
            source: { kind: dataset.kind, datasetId: dataset.id, datasetName: dataset.name, recordId: r.record.id, recordUrl: r.record.url },
          };
        },
        (rows) => repo.replaceDataset(dataset.id, rows),
      ),
  };
}
