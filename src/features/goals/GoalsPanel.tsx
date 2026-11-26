import { useMemo, useState } from 'react';
import {
  GOAL_META,
  goalProgress,
  newGoal,
  type Goal,
  type GoalMetric,
  type GoalPeriod,
  type GoalProgress,
  type GoalRepository,
  type GoalStatus,
} from '../../domain/goals/goals';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart } from '../../ui/charts/LineChart';
import { Badge, Icon } from '../../ui/primitives';

const DEFAULT_TARGET: Record<GoalMetric, Record<GoalPeriod, number>> = {
  trading_days: { week: 4, month: 15 },
  net_r: { week: 3, month: 10 },
  net_pl: { week: 0.75, month: 2.5 },
  win_rate: { week: 50, month: 50 },
  consistency: { week: 40, month: 30 },
};

const STATUS: Record<GoalStatus, { label: string; tone: 'positive' | 'warning' | 'negative' | 'neutral' | 'info'; icon: 'check' | 'alert' | 'x' | 'minus' }> = {
  achieved: { label: 'Achieved', tone: 'positive', icon: 'check' },
  on_track: { label: 'On track', tone: 'info', icon: 'check' },
  behind: { label: 'Behind pace', tone: 'warning', icon: 'alert' },
  breached: { label: 'Over limit', tone: 'negative', icon: 'x' },
  no_data: { label: 'No trades yet', tone: 'neutral', icon: 'minus' },
};

function fmtGoal(metric: GoalMetric, v: number | null) {
  if (v === null) return '—';
  switch (metric) {
    case 'trading_days':
      return `${v}`;
    case 'net_r':
      return `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}R`;
    case 'net_pl':
      return `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}%`;
    default:
      return `${Number(v.toFixed(1))}%`;
  }
}

function GoalCard({ p, onRemove }: { p: GoalProgress; onRemove: () => void }) {
  const meta = GOAL_META[p.goal.metric];
  const st = STATUS[p.status];
  const lower = !!meta.lowerIsBetter;
  const cumulative = p.pace !== null;
  return (
    <article className="goal">
      <header className="goal__head">
        <div>
          <div className="eyebrow">
            {meta.label} · this {p.goal.period}
          </div>
          <div className="goal__value">
            {fmtGoal(p.goal.metric, p.current)}
            <span className="goal__target">
              {lower ? ' max ' : ' / '}
              {fmtGoal(p.goal.metric, p.goal.target)}
            </span>
          </div>
        </div>
        <div className="goal__actions">
          <Badge tone={st.tone} icon={st.icon}>
            {st.label}
          </Badge>
          <button className="icon-btn" aria-label={`Remove ${meta.label} goal`} onClick={onRemove}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </header>
      <div className={`goal__bar ${p.status === 'breached' ? 'is-breached' : ''}`} aria-hidden="true">
        <span style={{ width: `${p.ratio * 100}%` }} />
      </div>
      <p className="goal__help">
        {lower
          ? p.current === null
            ? meta.help
            : `Best day is ${fmtGoal('consistency', p.current)} of this ${p.goal.period}'s profit.`
          : cumulative && p.current !== null
            ? `Pace for today: ${fmtGoal(p.goal.metric, p.pace)}.`
            : meta.help}
      </p>
      <LineChart
        height={150}
        startAtZero={false}
        baseline={cumulative ? 0 : null}
        format={(v) => fmtGoal(p.goal.metric, v)}
        ariaLabel={`${meta.label}: ${fmtGoal(p.goal.metric, p.current)} against a target of ${fmtGoal(p.goal.metric, p.goal.target)}`}
        series={[
          { key: 'actual', label: 'Actual', color: 'var(--series-1)', points: p.series.map((s) => ({ date: s.date, value: s.actual })) },
          {
            key: 'target',
            label: cumulative ? 'Target pace' : lower ? 'Limit' : 'Target',
            color: 'var(--text-3)',
            reference: true,
            points: p.series.map((s) => ({ date: s.date, value: s.target })),
          },
        ]}
      />
    </article>
  );
}

export function GoalsPanel({ trades, repo, today }: { trades: StandardTrade[]; repo: GoalRepository; today: string }) {
  const [goals, setGoals] = useState<Goal[]>(() => repo.list());
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<GoalMetric>('trading_days');
  const [period, setPeriod] = useState<GoalPeriod>('month');
  const [target, setTarget] = useState<string>(String(DEFAULT_TARGET.trading_days.month));

  const progress = useMemo(() => goals.map((g) => goalProgress(g, trades, today)), [goals, trades, today]);

  const update = (next: Goal[]) => {
    setGoals(next);
    repo.save(next);
  };
  const pick = (m: GoalMetric, p: GoalPeriod) => {
    setMetric(m);
    setPeriod(p);
    setTarget(String(DEFAULT_TARGET[m][p]));
  };
  const valid = target.trim() !== '' && Number.isFinite(Number(target)) && Number(target) > 0;

  return (
    <section className="panel">
      <header className="panel__head">
        <h3 className="eyebrow">Goals</h3>
        {!adding && (
          <button className="btn btn--xs" onClick={() => setAdding(true)}>
            <Icon name="sparkle" size={12} /> Add goal
          </button>
        )}
      </header>

      {adding && (
        <form
          className="goal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            update([...goals, newGoal(metric, period, Number(target))]);
            setAdding(false);
          }}
        >
          <label className="field">
            <span className="eyebrow">Goal</span>
            <span className="select">
              <select value={metric} onChange={(e) => pick(e.target.value as GoalMetric, period)}>
                {(Object.keys(GOAL_META) as GoalMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {GOAL_META[m].label}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" className="select__chevron" />
            </span>
          </label>
          <label className="field">
            <span className="eyebrow">Period</span>
            <span className="select">
              <select value={period} onChange={(e) => pick(metric, e.target.value as GoalPeriod)}>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
              <Icon name="chevronDown" className="select__chevron" />
            </span>
          </label>
          <label className="field field--narrow">
            <span className="eyebrow">{GOAL_META[metric].lowerIsBetter ? 'Max best-day share' : 'Target'}</span>
            <span className="input-unit">
              <input type="number" inputMode="decimal" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target value" />
              <span>{GOAL_META[metric].unit}</span>
            </span>
          </label>
          <p className="goal-form__help muted">{GOAL_META[metric].help}</p>
          <div className="goal-form__actions">
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary btn--xs" disabled={!valid}>
              Save goal
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 && !adding ? (
        <div className="goal-empty">
          <p className="muted">Set a target and track it through the week or month.</p>
          <div className="pills">
            {(
              [
                ['trading_days', 'month', '15 trading days a month'],
                ['net_r', 'month', '+10R a month'],
                ['consistency', 'month', 'No day over 30% of profit'],
                ['win_rate', 'month', '50% win rate'],
              ] as [GoalMetric, GoalPeriod, string][]
            ).map(([m, p, label]) => (
              <button key={label} className="pill" onClick={() => update([...goals, newGoal(m, p, DEFAULT_TARGET[m][p])])}>
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="goal-grid">
          {progress.map((p) => (
            <GoalCard key={p.goal.id} p={p} onRemove={() => update(goals.filter((g) => g.id !== p.goal.id))} />
          ))}
        </div>
      )}
    </section>
  );
}
