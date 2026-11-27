import type { FieldDefinition } from '../fields/types';
import { createSuggestedConfig } from '../mapping/config';
import { evaluateMapping } from '../mapping/evaluate';
import type { MappingConfig } from '../mapping/types';
import type { SourceDataset, SourceSchema } from '../source/types';

/**
 * Trading Centre: work out which shared database plays which role, so a user
 * of the template never has to map anything by hand.
 */
export type CentreRole = 'trades' | 'daily' | 'flow' | 'plans' | 'playbook' | 'reviews';

export const ROLE_LABEL: Record<CentreRole, string> = {
  trades: 'Trade journal',
  daily: 'Daily ASR',
  flow: 'Flow log',
  plans: 'Plans',
  playbook: 'Playbook',
  reviews: 'Reviews',
};

/** Words in a database name that hint at its role. */
const NAME_HINTS: Record<CentreRole, RegExp> = {
  trades: /journal|trades?\b|log of trades/i,
  daily: /daily|asr|day review/i,
  flow: /flow/i,
  plans: /plans?|commitments?|objectives?|goals?/i,
  playbook: /playbook|setups?|strateg/i,
  reviews: /reviews?|asr/i,
};

export interface RoleCandidate {
  role: CentreRole;
  /** 0–1: share of the role's fields that mapped, plus a name hint. */
  score: number;
  /** Every required field maps without problems. */
  ready: boolean;
  config?: MappingConfig;
}

export interface Detection {
  dataset: SourceDataset;
  schema: SourceSchema;
  role: CentreRole | null;
  candidate: RoleCandidate | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A Reviews database: a title plus a period/date and at least one result column. */
function reviewsScore(schema: SourceSchema): number {
  const names = schema.properties.map((p) => norm(p.name));
  const has = (xs: string[]) => xs.some((x) => names.includes(x));
  let score = 0;
  if (has(['period', 'type', 'reviewtype'])) score += 0.3;
  if (schema.properties.some((p) => p.type === 'date')) score += 0.2;
  if (has(['netr', 'winrate', 'trades', 'pl', 'pnl'])) score += 0.3;
  return score;
}

export function scoreRole(role: Exclude<CentreRole, 'reviews'>, fields: readonly FieldDefinition[], dataset: SourceDataset, schema: SourceSchema): RoleCandidate {
  const config = createSuggestedConfig(dataset, schema, fields, role);
  const ev = evaluateMapping(config, schema.properties, fields);
  const s = ev.summary;
  const coverage = (s.mandatoryMapped + s.optionalMapped) / Math.max(1, s.mandatoryTotal + s.optionalTotal);
  const hint = NAME_HINTS[role].test(dataset.name) ? 0.25 : 0;
  return { role, score: ev.canProceed ? coverage + hint : 0, ready: ev.canProceed, config };
}

/**
 * Assign roles. Each database gets its best-fitting role; when two databases
 * compete for a single-instance role, the higher score wins. Several trade
 * databases are allowed (e.g. a journal and a separate missed-trades log).
 */
export function detectRoles(inputs: { dataset: SourceDataset; schema: SourceSchema }[], fieldsByRole: Record<Exclude<CentreRole, 'reviews'>, readonly FieldDefinition[]>): Detection[] {
  const ranked = inputs.map(({ dataset, schema }) => {
    const cands: RoleCandidate[] = (Object.keys(fieldsByRole) as Exclude<CentreRole, 'reviews'>[]).map((role) => scoreRole(role, fieldsByRole[role], dataset, schema));
    const rs = reviewsScore(schema) + (NAME_HINTS.reviews.test(dataset.name) && !/daily/i.test(dataset.name) ? 0.25 : 0);
    if (rs >= 0.8) cands.push({ role: 'reviews', score: rs, ready: true });
    cands.sort((a, b) => b.score - a.score);
    return { dataset, schema, cands: cands.filter((c) => c.score > 0) };
  });

  const taken = new Map<CentreRole, { score: number; index: number }>();
  const out: Detection[] = ranked.map(({ dataset, schema }) => ({ dataset, schema, role: null, candidate: null }));
  // Highest-confidence assignments first.
  const order = ranked.map((r, i) => ({ i, best: r.cands[0]?.score ?? 0 })).sort((a, b) => b.best - a.best);
  for (const { i } of order) {
    for (const c of ranked[i].cands) {
      if (c.role !== 'trades' && taken.has(c.role)) continue;
      taken.set(c.role, { score: c.score, index: i });
      out[i] = { ...out[i], role: c.role, candidate: c };
      break;
    }
  }
  return out;
}
