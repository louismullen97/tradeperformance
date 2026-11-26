export type ReviewPeriod = 'week' | 'month' | 'quarter';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export interface PeriodRange {
  start: string;
  end: string;
  label: string;
}

/** The week (Mon–Sun), calendar month or calendar quarter containing `anchor`. */
export function periodRange(period: ReviewPeriod, anchor: string): PeriodRange {
  const d = utc(anchor);
  if (period === 'week') {
    const start = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return { start: iso(start), end: iso(end), label: `${dayFmt.format(start)} – ${dayFmt.format(end)} ${end.getUTCFullYear()}` };
  }
  if (period === 'month') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { start: iso(start), end: iso(end), label: monthFmt.format(start) };
  }
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0));
  return { start: iso(start), end: iso(end), label: `Q${q + 1} ${d.getUTCFullYear()}` };
}

/** Move the anchor by whole periods. */
export function shiftPeriod(period: ReviewPeriod, anchor: string, delta: number): string {
  const d = utc(periodRange(period, anchor).start);
  if (period === 'week') return iso(new Date(d.getTime() + delta * 7 * 86_400_000));
  const months = period === 'month' ? delta : delta * 3;
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

export const PERIOD_NOUN: Record<ReviewPeriod, string> = { week: 'week', month: 'month', quarter: 'quarter' };
