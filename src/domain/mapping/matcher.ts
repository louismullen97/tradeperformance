import type { FieldDefinition } from '../fields/types';

/**
 * Name similarity between a source property and a standardised field.
 * Pure string logic — type compatibility is applied separately in `suggest.ts`.
 */

const SYMBOLS: [RegExp, string][] = [
  [/%/g, ' percent '],
  [/&/g, ' and '],
  [/#/g, ' number '],
];

export function normaliseName(name: string): string {
  let s = name.toLowerCase();
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  return s
    .replace(/[_\-/:.()[\]]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(normalised: string): string[] {
  return normalised.split(' ').filter(Boolean);
}

function bigrams(s: string): string[] {
  const compact = s.replace(/ /g, '');
  const out: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) out.push(compact.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

/** Score a single candidate name against a single alias. 0–1. */
export function scoreName(propertyName: string, alias: string): number {
  const p = normaliseName(propertyName);
  const a = normaliseName(alias);
  if (!p || !a) return 0;
  if (p === a) return 1;
  if (p.replace(/ /g, '') === a.replace(/ /g, '')) return 0.96;

  const pt = tokens(p);
  const at = tokens(a);
  // Alias fully contained in the property name ("Trade Setup Used" ⊇ "trade setup").
  // Guard against single short tokens like "r" matching everything.
  const meaningful = at.length >= 2 || (at[0]?.length ?? 0) >= 4;
  if (meaningful && at.every((t) => pt.includes(t))) {
    return 0.78 + 0.1 * (at.length / pt.length);
  }
  // Fuzzy fallback — catches typos and small variations ("Instrumnet", "Setups").
  const d = dice(p, a);
  return d >= 0.75 ? d * 0.8 : 0;
}

export interface NameMatch {
  score: number;
  matchedAlias: string;
}

export function bestNameMatch(propertyName: string, field: FieldDefinition): NameMatch {
  const candidates = [field.label, field.key, ...field.aliases];
  let best: NameMatch = { score: 0, matchedAlias: '' };
  for (const alias of candidates) {
    const score = scoreName(propertyName, alias);
    if (score > best.score) best = { score, matchedAlias: alias };
  }
  return best;
}
