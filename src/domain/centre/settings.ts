import type { CentreRole } from './detect';

/** Which database plays which Trading Centre role (dataset ids), saved after detection. */
export interface CentreSettings {
  roles: Partial<Record<CentreRole, string[]>>;
  lastSync?: string;
}

const KEY = 'tradelens.centre.v1';

export function loadCentre(): CentreSettings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { roles: {} };
  } catch {
    return { roles: {} };
  }
}

export function saveCentre(s: CentreSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** The database used for a single-instance role (daily, plans, reviews, …). */
export const centreTarget = (role: CentreRole): string | undefined => loadCentre().roles[role]?.[0];
