import { useState } from 'react';
import { monthGrid, performance, type DayStats } from '../../domain/analytics/analytics';
import type { NewsEvent } from '../../domain/news/types';
import { fmtAmount, fmtPct, fmtR, fmtWinRate, Icon } from '../../ui/primitives';

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
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtShort = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

function tone(v: number | null) {
  if (v === null || v === 0) return 'flat';
  return v > 0 ? 'gain' : 'loss';
}

interface Props {
  year: number;
  month: number; // 0-based
  days: Map<string, DayStats>;
  metric: CalendarMetric;
  metrics: CalendarMetric[];
  selected: string | null;
  today: string;
  /** High-impact economic events by ISO date. */
  news?: Map<string, NewsEvent[]>;
  onSelect: (date: string) => void;
  onMonthChange: (delta: number) => void;
  onToday?: () => void;
  onMetricChange: (m: CalendarMetric) => void;
}

export function TradeCalendar({ year, month, days, metric, metrics, selected, today, news, onSelect, onMonthChange, onToday, onMetricChange }: Props) {
  const weeks = monthGrid(year, month);
  const [tip, setTip] = useState<{ date: string; x: number; y: number } | null>(null);

  const monthDays = weeks
    .flat()
    .filter((d): d is string => !!d)
    .map((d) => days.get(d))
    .filter((d): d is DayStats => !!d);
  const monthTotals = {
    netR: monthDays.reduce((a, d) => a + d.netR, 0),
    netPl: monthDays.reduce((a, d) => a + d.netPl, 0),
    netAmount: monthDays.some((d) => d.netAmount !== null) ? monthDays.reduce((a, d) => a + (d.netAmount ?? 0), 0) : null,
  };
  const monthValue = metricValue(monthTotals, metric);
  const monthPerf = performance(monthDays.flatMap((d) => d.trades));
  const best = monthDays.length ? monthDays.reduce((a, d) => ((metricValue(d, metric) ?? 0) > (metricValue(a, metric) ?? 0) ? d : a)) : null;
  const worst = monthDays.length ? monthDays.reduce((a, d) => ((metricValue(d, metric) ?? 0) < (metricValue(a, metric) ?? 0) ? d : a)) : null;
  const monthHasNews = news ? weeks.flat().some((d) => d && news.has(d)) : false;
  const isCurrentMonth = today.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);

  const tipDay = tip ? days.get(tip.date) : undefined;
  const tipNews = tip ? news?.get(tip.date) : undefined;

  return (
    <section className="calendar panel">
      <header className="calendar__head">
        <div className="calendar__nav">
          <button className="icon-btn" aria-label="Previous month" onClick={() => onMonthChange(-1)}>
            <Icon name="chevronRight" className="flip-x" />
          </button>
          <h2 className="calendar__title">{monthFmt.format(new Date(Date.UTC(year, month, 1)))}</h2>
          <button className="icon-btn" aria-label="Next month" onClick={() => onMonthChange(1)}>
            <Icon name="chevronRight" />
          </button>
          {onToday && !isCurrentMonth && (
            <button className="btn btn--sm btn--ghost" onClick={onToday}>
              Today
            </button>
          )}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Calendar value">
          {metrics.map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} className={metric === m ? 'is-active' : ''} onClick={() => onMetricChange(m)}>
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </header>

      <dl className="calendar__summary" aria-label="Month summary">
        <div className="calendar__summary-main">
          <dt>Net this month</dt>
          <dd className={`num-${tone(monthValue)}`}>{fmtMetric(monthValue, metric)}</dd>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{fmtWinRate(monthPerf.winRate)}</dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>
            {monthPerf.count}
            <span className="calendar__summary-sub"> in {monthDays.length} days</span>
          </dd>
        </div>
        <div>
          <dt>Profit factor</dt>
          <dd>{monthPerf.profitFactor === null ? '—' : monthPerf.profitFactor.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Expectancy</dt>
          <dd>{fmtR(monthPerf.avgR)}</dd>
        </div>
        <div>
          <dt>Best day</dt>
          <dd>
            {best ? fmtMetric(metricValue(best, metric), metric) : '—'}
            {best && <span className="calendar__summary-sub"> {fmtShort(best.date)}</span>}
          </dd>
        </div>
        <div>
          <dt>Worst day</dt>
          <dd>
            {worst ? fmtMetric(metricValue(worst, metric), metric) : '—'}
            {worst && <span className="calendar__summary-sub"> {fmtShort(worst.date)}</span>}
          </dd>
        </div>
      </dl>

      <div className="calendar__grid" role="grid" aria-label="Daily results">
        <div className="calendar__row calendar__row--head" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} className="calendar__dow" role="columnheader">
              {d}
            </div>
          ))}
          <div className="calendar__dow calendar__dow--week" role="columnheader">
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
            <div key={wi} className="calendar__row" role="row">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="day day--outside" role="gridcell" aria-hidden="true" />;
                const d = days.get(date);
                const v = d ? metricValue(d, metric) : null;
                const dayNews = news?.get(date);
                const label = [
                  longDate.format(new Date(`${date}T00:00:00Z`)),
                  d ? `${fmtMetric(v, metric)}, ${d.count} trade${d.count === 1 ? '' : 's'}, ${d.wins} won, ${d.losses} lost` : 'no trades',
                  dayNews ? `${dayNews.length} high-impact news event${dayNews.length === 1 ? '' : 's'}` : '',
                ]
                  .filter(Boolean)
                  .join('. ');
                return (
                  <button
                    key={date}
                    role="gridcell"
                    aria-label={label}
                    aria-pressed={selected === date}
                    className={`day ${d ? `day--${tone(v)}` : 'day--empty'} ${selected === date ? 'is-selected' : ''} ${date === today ? 'is-today' : ''} ${di >= 5 ? 'day--weekend' : ''}`}
                    onClick={() => onSelect(date)}
                    onPointerEnter={(e) => (d || dayNews) && setTip({ date, x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2, y: e.currentTarget.offsetTop })}
                    onPointerLeave={() => setTip(null)}
                  >
                    <span className="day__top">
                      <span className="day__date">{Number(date.slice(8))}</span>
                      {dayNews && <span className="news-dot" aria-hidden="true" />}
                    </span>
                    {d && (
                      <span className="day__body">
                        <span className="day__value">{fmtMetric(v, metric)}</span>
                        <span className="day__count">
                          {d.count} trade{d.count === 1 ? '' : 's'}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
              <div className={`day day--week ${weekCount ? `day--week-${tone(wv)}` : ''}`} role="gridcell">
                <span className="day__top">
                  <span className="day__date">W{wi + 1}</span>
                </span>
                {weekCount > 0 ? (
                  <span className="day__body">
                    <span className="day__value">{fmtMetric(wv, metric)}</span>
                    <span className="day__count">
                      {weekCount} trade{weekCount === 1 ? '' : 's'}
                    </span>
                  </span>
                ) : (
                  <span className="day__body">
                    <span className="day__count">No trades</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {tip && (tipDay || tipNews) && (
          <div className="chart-tip calendar__tip" style={{ left: tip.x, top: tip.y }} role="status">
            <span className="chart-tip__title">{longDate.format(new Date(`${tip.date}T00:00:00Z`))}</span>
            {tipDay && (
              <>
                <strong>{fmtMetric(metricValue(tipDay, metric), metric)}</strong>
                <span>
                  {tipDay.wins} won · {tipDay.losses} lost · {tipDay.count} trade{tipDay.count === 1 ? '' : 's'}
                </span>
                {tipDay.trades.slice(0, 4).map((t) => (
                  <span key={t.id} className="chart-tip__muted">
                    {t.currency_pair} · {t.setup} · {fmtR(t.result_r)}
                  </span>
                ))}
              </>
            )}
            {tipNews && (
              <span className="chart-tip__news">
                {tipNews.slice(0, 4).map((n) => (
                  <span key={n.id}>
                    <span className="news-dot news-dot--inline" aria-hidden="true" />
                    {n.time ? `${n.time} ` : ''}
                    {n.currency} · {n.title}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </div>

      {monthHasNews && (
        <footer className="calendar__legend">
          <span className="news-dot news-dot--inline" aria-hidden="true" /> High-impact economic news
        </footer>
      )}
    </section>
  );
}
