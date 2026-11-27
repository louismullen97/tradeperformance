import type { Dimension } from '../analytics/dimensions';
import { CUSTOM_TAG_PREFIX } from '../import/importService';
import { isMissed } from '../trades/status';
import type { StandardTrade } from '../trades/types';

/**
 * One place that knows how a trade's tags are organised:
 *
 *   Behaviour  – what you did (good habits and mistakes). Has a tone.
 *   Technical  – chart and structure context.
 *   Psychology – how you felt.
 *   Other      – the generic "Tags" column.
 *   Custom     – any other multi-select column in the journal, by its name.
 *
 * Older journals with Positive/Negative tag columns are folded in: known
 * behaviours count as behaviour; other negative tags are treated as mistakes
 * (behaviour); other positive tags as technical context. Missed
 * reasons that describe behaviour (Hesitation, Fear after a loss) count too, so
 * one flag shows its cost across taken and missed trades.
 */

export type TagTone = 'good' | 'bad' | 'neutral';

export const BEHAVIOUR = {
  good: ['Followed plan', 'Patient', 'Managed well', 'Calm'],
  bad: ['Hesitation', 'FOMO entry', 'Revenge trading', 'Impulsive', 'Moved stop', 'Early exit'],
} as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Spellings seen in journals → the canonical behaviour name. */
const BEHAVIOUR_ALIASES: Record<string, string> = Object.fromEntries(
  (
    [
      ['Followed plan', ['followedplan', 'followedtheplan', 'followedmyplan', 'followedrules', 'stucktoplan', 'maxtradesreached']],
      ['Patient', ['patient', 'patience', 'waitedforconfirmation']],
      ['Managed well', ['managedwell', 'wellmanaged', 'goodmanagement']],
      ['Calm', ['calm', 'feltcalm']],
      ['Hesitation', ['hesitation', 'hesitant', 'hesitated', 'fearafteraloss']],
      ['FOMO entry', ['fomoentry', 'fomo', 'chased', 'chasedentry']],
      ['Revenge trading', ['revengetrading', 'revengetrade', 'revenge']],
      ['Impulsive', ['impulsive', 'impulsiveentry', 'impulse']],
      ['Moved stop', ['movedstop', 'movedsl', 'movedmystop', 'movedstoploss']],
      ['Early exit', ['earlyexit', 'exitedearly', 'closedearly', 'cutwinnerearly']],
    ] as [string, string[]][]
  ).flatMap(([canonical, keys]) => keys.map((k) => [k, canonical])),
);

/** The canonical behaviour name for a value, or null if it isn't a known behaviour. */
export function canonicalBehaviour(value: string): string | null {
  return BEHAVIOUR_ALIASES[norm(value)] ?? null;
}

/** Unrecognised values seen in an old Negative tags column — they are mistakes. */
const LEGACY_BAD = new Set<string>();

export function behaviourTone(tag: string): TagTone {
  if (LEGACY_BAD.has(tag)) return 'bad';
  const c = canonicalBehaviour(tag) ?? tag;
  if ((BEHAVIOUR.good as readonly string[]).includes(c)) return 'good';
  if ((BEHAVIOUR.bad as readonly string[]).includes(c)) return 'bad';
  return 'neutral';
}

const list = (t: StandardTrade, key: string): string[] => {
  const v = t.optional[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (typeof v === 'string' && v.trim()) return v.split(/\s*,\s*/).filter(Boolean);
  return [];
};
const uniq = (xs: string[]) => [...new Set(xs)];

export interface TradeTags {
  behaviour: string[];
  technical: string[];
  psychology: string[];
  other: string[];
  /** Custom multi-select columns, keyed by column name. */
  custom: Record<string, string[]>;
  /** Values from the old Positive/Negative columns (for tone). */
  legacyGood: string[];
  legacyBad: string[];
}

const cache = new WeakMap<StandardTrade, TradeTags>();

export function tagsOf(t: StandardTrade): TradeTags {
  const hit = cache.get(t);
  if (hit) return hit;
  const behaviour: string[] = [];
  const technical: string[] = [];
  for (const v of list(t, 'behaviour_tags')) behaviour.push(canonicalBehaviour(v) ?? v);
  technical.push(...list(t, 'technical_tags'));
  const legacyGood = list(t, 'positive_tags');
  const legacyBad = list(t, 'negative_tags');
  for (const v of legacyGood) {
    const c = canonicalBehaviour(v);
    if (c) behaviour.push(c);
    else technical.push(v);
  }
  for (const v of legacyBad) {
    const c = canonicalBehaviour(v);
    if (c) behaviour.push(c);
    else {
      LEGACY_BAD.add(v);
      behaviour.push(v);
    }
  }
  if (isMissed(t)) {
    for (const reason of list(t, 'missed_reason')) {
      const c = canonicalBehaviour(reason);
      if (c) behaviour.push(c);
    }
  }
  const custom: Record<string, string[]> = {};
  for (const key of Object.keys(t.optional)) {
    if (key.startsWith(CUSTOM_TAG_PREFIX)) custom[key.slice(CUSTOM_TAG_PREFIX.length)] = list(t, key);
  }
  const out: TradeTags = {
    behaviour: uniq(behaviour),
    technical: uniq(technical),
    psychology: uniq(list(t, 'psychology_tags')),
    other: uniq(list(t, 'tags')),
    custom,
    legacyGood,
    legacyBad,
  };
  cache.set(t, out);
  return out;
}

/** Good habits on a trade: positive behaviour (plus old "positive" tags that are behaviours). */
export function goodTagsOf(t: StandardTrade): string[] {
  return tagsOf(t).behaviour.filter((b) => behaviourTone(b) === 'good');
}

/** Mistakes on a trade: negative behaviour, plus anything from an old Negative tags column. */
export function badTagsOf(t: StandardTrade): string[] {
  return tagsOf(t).behaviour.filter((b) => behaviourTone(b) === 'bad');
}

export type TagGroupKind = 'behaviour' | 'technical' | 'psychology' | 'other' | 'custom' | 'rating';

export interface TagGroup extends Dimension {
  kind: TagGroupKind;
}

const RATING: TagGroup = {
  key: 'execution_rating',
  label: 'Trade rating',
  kind: 'rating',
  values: (t) => (typeof t.optional.execution_rating === 'number' ? [`${Math.round(t.optional.execution_rating)}/5`] : []),
  order: ['5/5', '4/5', '3/5', '2/5', '1/5'],
};

const FIXED: TagGroup[] = [
  { key: 'behaviour', label: 'Behaviour', kind: 'behaviour', values: (t) => tagsOf(t).behaviour },
  { key: 'technical', label: 'Technical', kind: 'technical', values: (t) => tagsOf(t).technical },
  { key: 'psychology', label: 'Psychology', kind: 'psychology', values: (t) => tagsOf(t).psychology },
  { key: 'other_tags', label: 'Other tags', kind: 'other', values: (t) => tagsOf(t).other },
];

/**
 * Every tag group with data in these trades, in a stable order: behaviour,
 * technical, psychology, other, then custom columns (alphabetical), then
 * optionally the trade rating.
 */
export function tagGroups(trades: StandardTrade[], opts: { rating?: boolean } = {}): TagGroup[] {
  const customNames = new Set<string>();
  for (const t of trades) for (const name of Object.keys(tagsOf(t).custom)) customNames.add(name);
  const custom: TagGroup[] = [...customNames].sort((a, b) => a.localeCompare(b)).map((name) => ({
    key: `custom:${name}`,
    label: name,
    kind: 'custom',
    values: (t) => tagsOf(t).custom[name] ?? [],
  }));
  const all = [...FIXED, ...custom, ...(opts.rating ? [RATING] : [])];
  return all.filter((g) => trades.some((t) => g.values(t).length > 0));
}

/** Look up any tag group by key, even if absent from the current trades. */
export function tagGroup(key: string): TagGroup {
  if (key === RATING.key) return RATING;
  const fixed = FIXED.find((g) => g.key === key);
  if (fixed) return fixed;
  const name = key.replace(/^custom:/, '');
  return { key, label: name, kind: 'custom', values: (t) => tagsOf(t).custom[name] ?? [] };
}

/** Tone of a tag within its group, for colouring chips. */
export function toneOf(group: TagGroupKind, tag: string): TagTone {
  return group === 'behaviour' ? behaviourTone(tag) : 'neutral';
}

export interface TagSummarySection {
  title: string;
  tone: TagTone;
  /** [tag, number of trades], most frequent first. */
  items: [string, number][];
}

/**
 * The tag picture for a review period: good habits, mistakes (taken and missed
 * trades, so a flag shows its full cost), technical context, psychology and any
 * custom columns. Sections with no tags are omitted.
 */
export function tagSummary(taken: StandardTrade[], missed: StandardTrade[], limit = 5): TagSummarySection[] {
  const count = (trades: StandardTrade[], get: (t: StandardTrade) => string[]): [string, number][] => {
    const m = new Map<string, number>();
    for (const t of trades) for (const tag of new Set(get(t))) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  };
  const both = [...taken, ...missed];
  const sections: TagSummarySection[] = [
    { title: 'What went well', tone: 'good', items: count(taken, goodTagsOf) },
    { title: 'What to work on', tone: 'bad', items: count(both, badTagsOf) },
    { title: 'Technical', tone: 'neutral', items: count(taken, (t) => tagsOf(t).technical) },
    { title: 'Psychology', tone: 'neutral', items: count(both, (t) => tagsOf(t).psychology) },
    ...tagGroups(taken)
      .filter((g) => g.kind === 'custom' || g.kind === 'other')
      .map((g): TagSummarySection => ({ title: g.label, tone: 'neutral', items: count(taken, g.values) })),
  ];
  return sections.filter((s) => s.items.length);
}
