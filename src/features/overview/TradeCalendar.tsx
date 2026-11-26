import { useState } from 'react';
import { monthGrid, type DayStats } from '../../domain/analytics/analytics';
import { fmtAmount, fmtPct, fmtR, Icon } from '../../ui/primitives';

export type CalendarMetric = 'r' | 'pct' | 'amount';

export const METRIC_LABEL: Record<CalendarMetric, string> = { r: 'R', pct: '%', amount: 'Amount' };

export function metricValue(d: { netR: number; netPl: number; netAmount: number | null }, m: CalendarMetric): number | null {
  return m === 'r' ? d.netR : m === 'pct' ? d.netPl : d.netAmount;
}

export function fmtMetric(v: number | null, m: CalendarMetric) {
  if (v === null) return '—';
  return m === 'r' ? fmtR(v) : m === 'pct' ? fmtPct(v) : fmtAmount(v);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function tone(v: number | null) {
  if (v === null || v === 0) return 'flat';
  return v > 0 ? 'gain' : 'loss';
}

interface Props {
  year: number;
  month: number; // 0-based
  days: Map<string, DayStats>;
  metric: CalendarMetric;
  selected: string | null;
  today: string;
  onSelect: (date: string) => void;
  onMonthChange: (delta: number) => void;
  onMetricChange: (m: CalendarMetric) => void;
  metrics: CalendarMetric[];
}

export function TradeCalendar({ year, month, days, metric, selected, today, onSelect, onMonthChange, onMetricChange, metrics }: Props) {
  const weeks = monthGrid(year, month);
  const [tip, setTip] = useState<{ date: string; x: number; y: number } | null>(null);

  const monthDays = weeks.flat().filter((d): d is string => !!d).map((d) => days.get(d)).filter((d): d is DayStats => !!d);
  const monthTotals = monthDays.reduce(
    (a, d) => ({
      netR: a.netR + d.netR,
      netPl: a.netPl + d.netPl,
      netAmount: d.netAmount === null ? a.netAmount : (a.netAmount ?? 0) + d.netAmount,
      count: a.count + d.count,
      wins: a.wins + d.wins,
      losses: a.losses + d.losses,
    }),
    { netR: 0, netPl: 0, netAmount: null as number | null, count: 0, wins: 0, losses: 0 },
  );
  const monthValue = metricValue(monthTotals, metric);
  const tipDay = tip ? days.get(tip.date) : undefined;

  return (
    <section className="panel calendar-panel">
      <header className="panel__head panel__head--wrap">
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Previous month" onClick={() => onMonthChange(-1)}>
            <Icon name="arrowLeft" />
          </button>
          <h2 className="cal-title">{monthFmt.format(new Date(Date.UTC(year, month, 1)))}</h2>
          <button className="icon-btn" aria-label="Next month" onClick={() => onMonthChange(1)}>
            <Icon name="arrowRight" />
          </button>
          <span className="cal-month-total">
            <span className={`num num--${tone(monthValue)}`}>{fmtMetric(monthValue, metric)}</span>
            <span className="muted">
              {monthTotals.count} trades · {monthTotals.wins}W {monthTotals.losses}L
            </span>
          </span>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Calendar value">
          {metrics.map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} className={metric === m ? 'is-active' : ''} onClick={() => onMetricChange(m)}>
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </header>

      <div className="cal" role="grid" aria-label="Daily results">
        <div className="cal__row cal__row--head" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal__dow" role="columnheader">
              {d}
            </div>
          ))}
          <div className="cal__dow cal__dow--week" role="columnheader">
            Week
          </div>
        </div>
        {weeks.map((week, wi) => {
          const wk = week.map((d) => (d ? days.get(d) : undefined)).filter((d): d is DayStats => !!d);
          const weekTotals = {
            netR: wk.reduce((a, d) => a + d.netR, 0),
            netPl: wk.reduce((a, d) => a + d.netPl, 0),
            netAmount: wk.some((d) => d.netAmount !== null) ? wk.reduce((a, d) => a + (d.netAmount ?? 0), 0) : null,
          };
          const weekCount = wk.reduce((a, d) => a + d.count, 0);
          const wv = metricValue(weekTotals, metric);
          return (
            <div key={wi} className="cal__row" role="row">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="cal__cell cal__cell--blank" role="gridcell" aria-hidden="true" />;
                const d = days.get(date);
                const v = d ? metricValue(d, metric) : null;
                const dayNum = Number(date.slice(8));
                const label = d
                  ? `${longDate.format(new Date(`${date}T00:00:00Z`))}: ${fmtMetric(v, metric)}, ${d.count} trade${d.count === 1 ? '' : 's'}, ${d.wins} won, ${d.losses} lost`
                  : `${longDate.format(new Date(`${date}T00:00:00Z`))}: no trades`;
                return (
                  <button
                    key={date}
                    role="gridcell"
                    aria-label={label}
                    aria-pressed={selected === date}
                    className={`cal__cell ${d ? `cal__cell--${tone(v)}` : 'cal__cell--empty'} ${selected === date ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`}
                    onClick={() => onSelect(date)}
                    onPointerEnter={(e) => d && setTip({ date, x: e.currentTarget.offsetLeft, y: e.currentTarget.offsetTop })}
                    onPointerLeave={() => setTip(null)}
                  >
                    <span className="cal__date">{dayNum}</span>
                    {d && (
                      <>
                        <span className="cal__value">{fmtMetric(v, metric)}</span>
                        <span className="cal__count">
                          {d.count} trade{d.count === 1 ? '' : 's'}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              <div className={`cal__cell cal__cell--week ${weekCount ? `cal__cell--${tone(wv)}` : ''}`} role="gridcell">
                {weekCount > 0 ? (
                  <>
                    <span className="cal__value">{fmtMetric(wv, metric)}</span>
                    <span className="cal__count">
                      {weekCount} trade{weekCount === 1 ? '' : 's'}
                    </span>
                  </>
                ) : (
                  <span className="cal__count">—</span>
                )}
              </div>
            </div>
          );
        })}
        {tip && tipDay && (
          <div className="chart-tip cal__tip" style={{ left: tip.x, top: tip.y - 8 }} role="status">
            <strong>{fmtMetric(metricValue(tipDay, metric), metric)}</strong>
            <span>
              {tipDay.wins}W · {tipDay.losses}L · {tipDay.count} trade{tipDay.count === 1 ? '' : 's'}
            </span>
            {tipDay.trades.slice(0, 4).map((t) => (
              <span key={t.id}>
                {t.currency_pair} · {t.setup} · {fmtR(t.result_r)}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
