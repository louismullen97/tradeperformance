import type { PlanRepository } from '../../domain/review/daily';
import { activeFocusAreas } from '../../domain/review/focus';
import { FocusAreas } from '../review/FocusAreas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dailyStats, performance } from '../../domain/analytics/analytics';
import type { GoalRepository } from '../../domain/goals/goals';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import { GoalsPanel } from '../goals/GoalsPanel';
import { amountOf, cumulativeR } from '../../domain/trades/summary';
import type { StandardTrade } from '../../domain/trades/types';
import { groupByLocalDate, type NewsEvent } from '../../domain/news/types';
import { fetchNews } from '../../sources/news/newsClient';
import { EquityCurve } from '../../ui/charts/EquityCurve';
import { ChartExport } from '../../ui/ChartExport';
import { PageHeader } from '../../ui/PageHeader';
import { Badge, fmtDate, fmtPct, fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';
import { fmtMetric, metricValue, TradeCalendar, type CalendarMetric } from './TradeCalendar';

const todayIso = () => new Date().toISOString().slice(0, 10);
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function initialMonth(trades: StandardTrade[]): { year: number; month: number } {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const latest = trades.reduce((a, t) => (t.trade_date > a ? t.trade_date : a), '');
  const target = trades.some((t) => t.trade_date.startsWith(thisMonth)) || !latest ? thisMonth : latest.slice(0, 7);
  return { year: Number(target.slice(0, 4)), month: Number(target.slice(5, 7)) - 1 };
}

export function OverviewPage({ trades: repo, goals, plans }: { trades: TradeRepository; goals: GoalRepository; plans?: PlanRepository }) {
  const [trades, setTrades] = useState<StandardTrade[] | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  const [metric, setMetric] = useState<CalendarMetric>('r');
  const [selected, setSelected] = useState<string | null>(null);
  const [news, setNews] = useState<Map<string, NewsEvent[]>>(new Map());

  // High-impact economic news for the visible month (optional — empty on failure).
  useEffect(() => {
    if (!ym) return;
    const from = new Date(Date.UTC(ym.year, ym.month, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(ym.year, ym.month + 1, 0)).toISOString().slice(0, 10);
    let live = true;
    void fetchNews(from, to).then((events) => live && setNews(groupByLocalDate(events)));
    return () => {
      live = false;
    };
  }, [ym]);

  useEffect(() => {
    void repo.list().then((all) => {
      const list = takenOnly(all);
      setTrades(list);
      setYm(initialMonth(list));
      const latest = list.reduce((a, t) => (t.trade_date > a ? t.trade_date : a), '');
      setSelected(latest || null);
    });
  }, [repo]);

  const days = useMemo(() => dailyStats(trades ?? []), [trades]);
  const perf = useMemo(() => performance(trades ?? []), [trades]);
  const equity = useMemo(() => {
    const sorted = [...(trades ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    return cumulativeR(sorted).map((p, i) => ({ ...p, tradeR: sorted[i].result_r, label: `${sorted[i].currency_pair} ${sorted[i].setup}` }));
  }, [trades]);
  const hasAmount = (trades ?? []).some((t) => amountOf(t) !== null);

  if (!trades || !ym) return null;

  if (trades.length === 0) {
    return (
      <div className="page">
        <PageHead />
        <div className="panel empty-state">
          <span className="empty-state__icon">
            <Icon name="grid" size={20} />
          </span>
          <h2 className="step-title">Your trading calendar lives here</h2>
          <p className="step-sub">Import your journal from Notion to see daily results, streaks and your equity curve.</p>
          <a className="btn btn--primary" href="#/imports">
            Import trades <Icon name="arrowRight" />
          </a>
        </div>
      </div>
    );
  }

  const day = selected ? days.get(selected) : undefined;
  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month + delta, 1));
    setYm({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  return (
    <div className="page">
      <PageHead />

      <div className="metrics metrics--6">
        <Stat label="Net R" value={fmtR(perf.netR)} tone={perf.netR >= 0 ? 'positive' : 'negative'} foot={`${perf.count} trades · ${perf.tradingDays} days`} />
        <Stat
          label="Win rate"
          value={fmtWinRate(perf.winRate)}
          foot={
            <>
              {perf.wins}W · {perf.losses}L · {perf.breakeven} BE
              {perf.winRate !== null && (
                <div className="meter meter--split" aria-hidden="true">
                  <span style={{ width: `${perf.winRate * 100}%` }} />
                </div>
              )}
            </>
          }
        />
        <Stat label="Profit factor" value={perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)} foot="R won ÷ R lost" />
        <Stat label="Expectancy" value={fmtR(perf.avgR)} foot="Average R per trade" />
        <Stat label="Max drawdown" value={perf.maxDrawdownR ? `\u2212${perf.maxDrawdownR.toFixed(2)}R` : '0R'} tone={perf.maxDrawdownR ? 'negative' : undefined} foot={perf.currentDrawdownR ? `Currently \u2212${perf.currentDrawdownR.toFixed(2)}R from peak` : 'At equity high'} />
        <Stat label="Streaks" value={`${perf.longestWinStreak}W / ${perf.longestLossStreak}L`} foot="Longest win / loss run" />
      </div>

      <TradeCalendar
        year={ym.year}
        month={ym.month}
        days={days}
        metric={metric}
        metrics={hasAmount ? ['r', 'pct', 'amount'] : ['r', 'pct']}
        selected={selected}
        today={todayIso()}
        onSelect={setSelected}
        onMonthChange={moveMonth}
        onToday={() => {
          const now = new Date();
          setYm({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
        }}
        news={news}
        onMetricChange={setMetric}
      />

      <GoalsPanel trades={trades} repo={goals} today={todayIso()} />

      {plans && activeFocusAreas(plans.entries()).length > 0 && <FocusAreas entries={activeFocusAreas(plans.entries())} trades={trades} today={todayIso()} compact />}

      <div className="overview-grid">
        <section className="panel">
          <header className="panel__head">
            <h3 className="section-title">Equity curve · cumulative R</h3>
            <ChartExport target={chartRef} title="Equity curve · cumulative R" subtitle={`${perf.count} trades · ${fmtR(perf.netR)}`} />
            <a className="panel__aside link" href="#/performance">
              Analyse <Icon name="arrowRight" size={12} />
            </a>
          </header>
          <div className="panel__body" ref={chartRef}>
            <EquityCurve points={equity} ariaLabel={`Cumulative R over ${equity.length} trades, ending at ${fmtR(perf.netR)}`} />
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <h3 className="section-title">{selected ? longDate.format(new Date(`${selected}T00:00:00Z`)) : 'Select a day'}</h3>
            {day && (
              <span className={`panel__aside num ${signTone(metricValue(day, metric))}`}>{fmtMetric(metricValue(day, metric), metric)}</span>
            )}
          </header>
          {day ? (
            <ul className="day-list">
              {day.trades.map((t) => (
                <li key={t.id}>
                  <div className="day-list__main">
                    <strong>{t.currency_pair}</strong>
                    <span className="muted">
                      {t.setup}
                      {typeof t.optional.management_style === 'string' ? ` · ${t.optional.management_style}` : ''}
                      {typeof t.optional.trading_session === 'string' ? ` · ${t.optional.trading_session}` : ''}
                    </span>
                  </div>
                  <span className={`num ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</span>
                  <span className={`num muted`}>{fmtPct(t.profit_loss_percentage)}</span>
                  {t.source.recordUrl && (
                    <a className="icon-btn" href={t.source.recordUrl} target="_blank" rel="noreferrer" aria-label="Open in Notion">
                      <Icon name="external" size={14} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel__body muted">No trades on this day. Click a day with trades to see them here.</p>
          )}
          <footer className="panel__foot">
            <Badge tone="neutral">{fmtDate(trades.reduce((a, t) => (t.trade_date < a ? t.trade_date : a), trades[0].trade_date))}</Badge>
            <span className="muted">to</span>
            <Badge tone="neutral">{fmtDate(trades.reduce((a, t) => (t.trade_date > a ? t.trade_date : a), ''))}</Badge>
            <a className="link" href="#/journal">
              All trades <Icon name="arrowRight" size={12} />
            </a>
          </footer>
        </section>
      </div>
    </div>
  );
}

function PageHead() {
  return <PageHeader title="Dashboard" description="Your trading month at a glance." />;
}
