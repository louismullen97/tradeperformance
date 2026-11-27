import type { FieldDefinition } from '../fields/types';
import type { SourceKind } from '../source/types';

/**
 * Daily ASR: one entry per trading day — self-rated performance and flow,
 * what went right and wrong, emotions, and free-text observations.
 * Logged in Tradelens (and optionally synced to Notion) or imported from Notion.
 */
export interface DailyReview {
  date: string;
  /** Self-rated execution quality, 1–10. */
  performanceScore: number | null;
  /** Average Flow Zone score for the day, 1–10. */
  flowScore: number | null;
  wins: string[];
  mistakes: string[];
  emotions: string[];
  observations: string | null;
  decisions: string | null;
  lesson: string | null;
  updatedAt: string;
  /** Where the entry lives outside Tradelens, if anywhere. */
  source?: { kind: SourceKind; datasetId: string; datasetName: string; recordId: string; recordUrl?: string };
}

export const DAILY_TAGS = {
  wins: ['Followed my plan', 'Avoided a poor trade', 'Waited for confirmation', 'Respected risk', 'Cut a loser early', 'Let a winner run', 'Stopped at max loss', 'Journaled every trade'],
  mistakes: ['Overtraded', 'Revenge trade', 'Broke a rule', 'FOMO entry', 'Moved my stop', 'Traded outside session', 'Ignored HTF bias', 'Sized up after a loss'],
  emotions: ['Calm', 'Focused', 'Confident', 'Patient', 'Anxious', 'Frustrated', 'Impatient', 'Tired', 'Overconfident'],
} as const;

export const emptyDaily = (date: string): DailyReview => ({
  date,
  performanceScore: null,
  flowScore: null,
  wins: [],
  mistakes: [],
  emotions: [],
  observations: null,
  decisions: null,
  lesson: null,
  updatedAt: new Date(0).toISOString(),
});

export const hasContent = (d: DailyReview) =>
  d.performanceScore !== null || d.flowScore !== null || d.wins.length + d.mistakes.length + d.emotions.length > 0 || !!(d.observations || d.decisions || d.lesson);

const text = (key: string, label: string, description: string, aliases: string[]): FieldDefinition => ({
  key,
  label,
  description,
  required: false,
  valueKind: 'string',
  group: 'meta',
  aliases,
  example: '',
});
const tags = (key: string, label: string, description: string, aliases: string[], example: string): FieldDefinition => ({
  key,
  label,
  description,
  required: false,
  valueKind: 'string_list',
  group: 'meta',
  aliases,
  example,
});

/** Field registry for importing a Notion "Daily ASR" database. */
export const DAILY_FIELDS: readonly FieldDefinition[] = [
  { key: 'date', label: 'Date', description: 'The trading day.', required: true, valueKind: 'date', group: 'core', aliases: ['Date', 'Day', 'Trading Day', 'Review Date'], example: '2026-11-24' },
  {
    key: 'performance_score',
    label: 'Performance score',
    description: 'How well you executed, 1–10.',
    required: true,
    valueKind: 'number',
    group: 'core',
    aliases: ['Performance', 'Performance Score', 'Execution', 'Execution Score', 'Day Score', 'Score'],
    plausibleRange: { min: 0, max: 10 },
    example: '7',
  },
  {
    key: 'flow_score',
    label: 'Flow score',
    description: 'Flow Zone for the day, 1–10.',
    required: false,
    valueKind: 'number',
    group: 'core',
    aliases: ['Flow', 'Flow Score', 'Flow Zone'],
    plausibleRange: { min: 0, max: 10 },
    example: '6',
  },
  tags('wins', 'Wins', 'Good habits and decisions.', ['Wins', 'Good Habits', 'Did Well', 'Positive', 'Positive Tags', 'Strengths'], 'Avoided a poor trade'),
  tags('mistakes', 'Mistakes', 'Rule breaks and errors.', ['Mistakes', 'Errors', 'Negative', 'Negative Tags', 'Rule Breaks', 'Weaknesses'], 'Overtraded'),
  tags('emotions', 'Emotions', 'How you felt during the day.', ['Emotions', 'Feelings', 'Mood', 'Psychology'], 'Calm'),
  text('observations', 'Observations', 'What you noticed in the market and yourself.', ['Observations', 'Notes', 'Market Notes', 'Summary']),
  text('decisions', 'Decisions', 'Key decisions and why.', ['Decisions', 'Key Decisions', 'Choices']),
  text('lesson', 'Lesson', 'The one thing to take forward.', ['Lesson', 'Lessons', 'Takeaway', 'Learning', 'Key Lesson']),
];

// ── Persistence ──────────────────────────────────────────────────────────

export interface DailyRepository {
  list(): Promise<DailyReview[]>;
  get(date: string): Promise<DailyReview | null>;
  save(entry: DailyReview): Promise<void>;
  /** Imports: newer edits win, so a later Tradelens edit isn't overwritten by an older Notion copy. */
  upsertMany(entries: DailyReview[]): Promise<{ inserted: number; updated: number }>;
}

const KEY = 'tradelens.daily.v1';

export class LocalStorageDailyRepository implements DailyRepository {
  private entries = new Map<string, DailyReview>();
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    try {
      const raw = this.storage?.getItem(KEY);
      for (const e of raw ? (JSON.parse(raw) as DailyReview[]) : []) this.entries.set(e.date, e);
    } catch {
      /* start empty */
    }
  }
  private persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      /* storage unavailable */
    }
  }
  async list() {
    return [...this.entries.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  async get(date: string) {
    return this.entries.get(date) ?? null;
  }
  async save(entry: DailyReview) {
    this.entries.set(entry.date, entry);
    this.persist();
  }
  async upsertMany(list: DailyReview[]) {
    let inserted = 0;
    let updated = 0;
    for (const e of list) {
      const cur = this.entries.get(e.date);
      if (!cur) inserted++;
      else if (cur.updatedAt > e.updatedAt) continue;
      else updated++;
      this.entries.set(e.date, { ...e, source: e.source ?? cur?.source });
    }
    this.persist();
    return { inserted, updated };
  }
}

// ── Plans: commitments (week), focus areas (month), objectives (quarter) ──

export type PlanStatus = 'open' | 'kept' | 'missed';
export interface PlanItem {
  id: string;
  text: string;
  status: PlanStatus;
  /** The item's page in a Notion Plans database, once synced or imported. */
  notion?: { pageId: string; url?: string };
  /** Focus areas: the leak being tracked, as `dimension=value` pairs joined by `&` (e.g. `behaviour=Revenge trading`). */
  source?: string;
  /** Focus areas: what counts as improving. */
  goal?: FocusGoal;
  /** Focus areas: when tracking started (YYYY-MM-DD). */
  start?: string;
}
export type FocusGoal = 'fewer' | 'better_r';
export interface PlanRepository {
  get(key: string): PlanItem[];
  set(key: string, items: PlanItem[]): void;
  /** Merge items imported from Notion, matching by page id. */
  mergeImported(items: { key: string; item: PlanItem }[]): number;
  /** Every item with its period key. */
  entries(): { key: string; item: PlanItem }[];
}

/** Plan kinds as named in a Notion Plans database, and the review period each belongs to. */
export const PLAN_KIND = { week: 'Commitment', month: 'Focus area', quarter: 'Objective' } as const;
export type PlanPeriod = keyof typeof PLAN_KIND;
export function periodOfKind(kind: string | null | undefined): PlanPeriod {
  const k = (kind ?? '').toLowerCase();
  if (k.includes('objective') || k.includes('quarter') || k.includes('strategic')) return 'quarter';
  if (k.includes('focus') || k.includes('month')) return 'month';
  return 'week';
}

export const PLAN_FIELDS: readonly FieldDefinition[] = [
  { key: 'text', label: 'Plan item', description: 'The commitment, focus area or objective.', required: true, valueKind: 'string', group: 'core', aliases: ['Name', 'Commitment', 'Objective', 'Goal', 'Item', 'Plan'], example: 'Max 2 trades per day' },
  { key: 'period_start', label: 'Period', description: 'Any date inside the week, month or quarter it is for.', required: true, valueKind: 'date', group: 'core', aliases: ['Period', 'Date', 'Week', 'Month', 'Quarter', 'For'], example: '2026-11-23' },
  { key: 'kind', label: 'Type', description: 'Commitment (week), Focus area (month) or Objective (quarter).', required: false, valueKind: 'string', group: 'context', aliases: ['Type', 'Kind', 'Category', 'Level'], example: 'Commitment' },
  {
    key: 'status',
    label: 'Status',
    description: 'Open, Kept or Missed.',
    required: false,
    valueKind: 'string',
    group: 'context',
    aliases: ['Status', 'Result', 'Outcome', 'Done'],
    vocabulary: { open: ['open', 'not started', 'in progress', 'todo', 'to do'], kept: ['kept', 'done', 'achieved', 'complete', 'completed', 'yes'], missed: ['missed', 'failed', 'not done', 'no', 'broken'] },
    example: 'Kept',
  },
  { key: 'source', label: 'Source', description: 'Focus areas: the leak being tracked (set by Tradelens).', required: false, valueKind: 'string', group: 'meta', aliases: ['Source', 'Leak', 'Tracks'], example: 'behaviour=Revenge trading' },
  {
    key: 'goal',
    label: 'Goal',
    description: 'Focus areas: fewer occurrences or better average R.',
    required: false,
    valueKind: 'string',
    group: 'meta',
    aliases: ['Goal', 'Target', 'Aim'],
    vocabulary: { fewer: ['fewer occurrences', 'fewer', 'less often', 'reduce'], better_r: ['better average r', 'better r', 'improve r', 'better avg r'] },
    example: 'Fewer occurrences',
  },
];

const PLAN_KEY = 'tradelens.plans.v1';

export class LocalStoragePlanRepository implements PlanRepository {
  private plans: Record<string, PlanItem[]> = {};
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    try {
      this.plans = JSON.parse(this.storage?.getItem(PLAN_KEY) ?? '{}') as Record<string, PlanItem[]>;
    } catch {
      this.plans = {};
    }
  }
  get(key: string) {
    return this.plans[key] ?? [];
  }
  set(key: string, items: PlanItem[]) {
    this.plans[key] = items;
    this.persist();
  }
  private persist() {
    try {
      this.storage?.setItem(PLAN_KEY, JSON.stringify(this.plans));
    } catch {
      /* storage unavailable */
    }
  }
  entries() {
    return Object.entries(this.plans).flatMap(([key, items]) => items.map((item) => ({ key, item })));
  }
  mergeImported(items: { key: string; item: PlanItem }[]) {
    const ids = new Set(items.map((i) => i.item.notion?.pageId));
    // Drop the old copy of any imported page (it may have moved period), then add.
    for (const k of Object.keys(this.plans)) this.plans[k] = this.plans[k].filter((i) => !i.notion || !ids.has(i.notion.pageId));
    for (const { key, item } of items) this.plans[key] = [...(this.plans[key] ?? []), item];
    this.persist();
    return items.length;
  }
}

export const planKey = (period: string, start: string) => `${period}:${start}`;

/** Body of POST /api/notion/daily: create or update the day's page in a Daily ASR database. */
export interface SyncDailyRequest {
  dataSourceId: string;
  entry: DailyReview;
}

/** Body of POST /api/notion/plans: create, update or archive one plan item's page. */
export interface SyncPlanRequest {
  dataSourceId: string;
  item: PlanItem;
  period: PlanPeriod;
  start: string;
  end: string;
  /** Move the item's page to the trash (it was deleted in Tradelens). */
  archive?: boolean;
}
