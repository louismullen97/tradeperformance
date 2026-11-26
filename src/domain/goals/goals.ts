import { outcomeOf } from '../trades/summary';
import type { StandardTrade } from '../trades/types';

export type GoalMetric = 'trading_days' | 'net_r' | 'net_pl' | 'win_rate' | 'consistency';
export type GoalPeriod = 'week' | 'month';

export interface Goal {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  /**
   * trading_days: days · net_r: R · net_pl: % · win_rate: % (0–100) ·
   * consistency: max % of period profit allowed from the single best day.
   */
  target: number;
  createdAt: string;
}

export const GOAL_META: Record<GoalMetric, { label: string; unit: string; help: string; lowerIsBetter?: boolean }> = {
  trading_days: { label: 'Trading days', unit: 'days', help: 'Days with at least one trade.' },
  net_r: { label: 'Profit target (R)', unit: 'R', help: 'Net R for the period.' },
  net_pl: { label: 'Profit target (%)', unit: '%', help: 'Net P/L % for the period.' },
  win_rate: { label: 'Win rate', unit: '%', help: 'Wins ÷ (wins + losses).' },
  consistency: {
    label: 'Consistency',
    unit: '%',
    help: "Your best day's share of the period's profit must stay at or below the target (prop-firm rule).",
    lowerIsBetter: true,
  },
};

export type GoalStatus = 'achieved' | 'on_track' | 'behind' | 'breached' | 'no_data';

export interface GoalPoint {
  date: string;
  /** Actual value at the end of this day (null for days still to come). */
  actual: number | null;
  /** Target / pace value for this day. */
  target: number;
}

export interface GoalProgress {
  goal: Goal;
  start: string;
  end: string;
  current: number | null;
  /** Where the trader should be today to hit the target on pace (cumulative goals only). */
  pace: number | null;
  /** 0–1 fraction toward the target (for lower-is-better: 1 when within the limit). */
  ratio: number;
  status: GoalStatus;
  series: GoalPoint[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000));
const isWeekday = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function periodBounds(period: GoalPeriod, today: string): { start: string; end: string } {
  const d = new Date(`${today}T00:00:00Z`);
  if (period === 'week') {
    const start = addDays(today, -((d.getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  const start = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const end = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { start, end };
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Running value of the metric after each day, given trades up to and including that day. */
function valueAt(metric: GoalMetric, trades: StandardTrade[]): number | null {
  switch (metric) {
    case 'trading_days':
      return new Set(trades.map((t) => t.trade_date)).size;
    case 'net_r':
      return round(trades.reduce((a, t) => a + t.result_r, 0));
    case 'net_pl':
      return round(trades.reduce((a, t) => a + t.profit_loss_percentage, 0));
    case 'win_rate': {
      const w = trades.filter((t) => outcomeOf(t) === 'win').length;
      const l = trades.filter((t) => outcomeOf(t) === 'loss').length;
      return w + l ? round((w / (w + l)) * 100, 2) : null;
    }
    case 'consistency': {
      const byDay = new Map<string, number>();
      for (const t of trades) byDay.set(t.trade_date, (byDay.get(t.trade_date) ?? 0) + t.result_r);
      const total = [...byDay.values()].reduce((a, b) => a + b, 0);
      const best = Math.max(0, ...byDay.values());
      // Capped at 100%: when other days lost money the best day can exceed the net total,
      // which still just means "all of the profit came from one day".
      return total > 0 ? Math.min(100, round((best / total) * 100, 2)) : null;
    }
  }
}

export function goalProgress(goal: Goal, allTrades: StandardTrade[], today: string): GoalProgress {
  const { start, end } = periodBounds(goal.period, today);
  const inPeriod = allTrades.filter((t) => t.trade_date >= start && t.trade_date <= end);
  const days = daysBetween(start, end);
  const cumulative = goal.metric === 'trading_days' || goal.metric === 'net_r' || goal.metric === 'net_pl';
  const weekdays = days.filter(isWeekday);
  const paceFor = (date: string) => {
    const elapsed = weekdays.filter((d) => d <= date).length;
    return round((goal.target * elapsed) / Math.max(weekdays.length, 1), 2);
  };

  const series: GoalPoint[] = days.map((date) => ({
    date,
    actual: date <= today ? valueAt(goal.metric, inPeriod.filter((t) => t.trade_date <= date)) : null,
    target: cumulative ? paceFor(date) : goal.target,
  }));

  const current = valueAt(goal.metric, inPeriod);
  const pace = cumulative ? paceFor(today < end ? today : end) : null;
  let status: GoalStatus;
  let ratio: number;

  if (current === null) {
    status = 'no_data';
    ratio = 0;
  } else if (GOAL_META[goal.metric].lowerIsBetter) {
    status = current <= goal.target ? 'on_track' : 'breached';
    ratio = current <= goal.target ? 1 : goal.target / current;
  } else {
    ratio = goal.target > 0 ? Math.max(0, current / goal.target) : 1;
    if (current >= goal.target) status = 'achieved';
    else if (pace !== null) status = current >= pace ? 'on_track' : 'behind';
    else status = 'behind';
  }

  return { goal, start, end, current, pace, ratio: Math.min(ratio, 1), status, series };
}

// ── Persistence ────────────────────────────────────────────────────────

export interface GoalRepository {
  list(): Goal[];
  save(goals: Goal[]): void;
}

const KEY = 'tradelens.goals.v1';

export class LocalStorageGoalRepository implements GoalRepository {
  constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {}
  list(): Goal[] {
    try {
      const raw = this.storage?.getItem(KEY);
      return raw ? (JSON.parse(raw) as Goal[]) : [];
    } catch {
      return [];
    }
  }
  save(goals: Goal[]) {
    try {
      this.storage?.setItem(KEY, JSON.stringify(goals));
    } catch {
      /* storage unavailable */
    }
  }
}

export function newGoal(metric: GoalMetric, period: GoalPeriod, target: number): Goal {
  return { id: `goal_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, metric, period, target, createdAt: new Date().toISOString() };
}
