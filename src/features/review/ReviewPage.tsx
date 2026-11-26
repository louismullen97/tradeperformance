import { useEffect, useMemo, useState } from 'react';
import { breakdown, dailyEquity, performance } from '../../domain/analytics/analytics';
import { getDimension } from '../../domain/analytics/dimensions';
import { psychologyTagsOf } from '../../domain/analytics/psychology';
import { periodRange, shiftPeriod, PERIOD_NOUN, type ReviewPeriod } from '../../domain/analytics/review';
import type { TradeRepository } from '../../domain/trades/repository';
import { isMissed } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart } from '../../ui/charts/LineChart';
import { PageHeader } from '../../ui/PageHeader';
import { fmtDate, fmtPct, fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';
import { BreakdownTable } from '../performance/BreakdownTable';

const TABS = [
  { key: 'week', label: 'Weekly', href: '#/review/week' },
  { key: 'month', label: 'Monthly', href: '#/review/month' },
  { key: 'quarter', label: 'Quarterly', href: '#/review/quarter' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

function Delta({ value, unit, invert }: { value: number | null; unit: 'R' | 'pts' | 'count'; invert?: boolean }) {
  if (value === null) return <span className="delta delta--flat">No prior data</span>;
  const r = Math.round(value * 100) / 100;
  const good = invert ? r < 0 : r > 0;
  const cls = r === 0 ? 'flat' : good ? 'up' : 'down';
  const text = unit === 'R' ? fmtR(r) : unit === 'pts' ? `${r > 0 ? '+' : ''}${r} pts` : `${r > 0 ? '+' : ''}${r}`;
  return <span className={`delta delta--${cls}`}>{text} vs prior</span>;
}

function countTags(trades: StandardTrade[], get: (t: StandardTrade) => string[]) {
  const m = new Map<string, number>();
  for (const t of trades) for (const tag of get(t)) m.set(tag, (m.get(tag) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}
const listOf = (key: string) => (t: StandardTrade) => {
  const v = t.optional[key];
  return Array.isArray(v) ? v : [];
};

function TradeList({ title, trades }: { title: string; trades: StandardTrade[] }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="section-title">{title}</h2>
      </header>
      {trades.length === 0 ? (
        <p className="panel__body muted">None this period.</p>
      ) : (
        <ul className="list">
          {trades.map((t) => (
            <li key={t.id} className="list__item">
              <div className="list__main">
                <span className="strong">
                  {t.currency_pair} <span className="muted">· {t.setup}</span>
                </span>
                <span className="list__sub">{fmtDate(t.trade_date)}</span>
              </div>
              <span className={`num ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</span>
              {t.source.recordUrl && (
                <a className="icon-btn" href={t.source.recordUrl} target="_blank" rel="noreferrer" aria-label="Open in Notion">
                  <Icon name="external" size={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TagList({ title, items, empty }: { title: string; items: [string, number][]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i[1]));
  return (
    <div className="tag-list">
      <h3 className="label">{title}</h3>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul>
          {items.map(([tag, n]) => (
            <li key={tag}>
              <span className="tag-list__name">{tag}</span>
              <span className="tag-list__bar" aria-hidden="true">
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="num">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReviewPage({ trades: repo, period }: { trades: TradeRepository; period: ReviewPeriod }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);

  useEffect(() => {
    void repo.list().then((list) => {
      setAll(list);
      // Start on the current period, or the latest period with trades if this one is empty.
      const today = todayIso();
      const cur = periodRange(period, today);
      const latest = list.reduce((a, t) => (t.trade_date > a ? t.trade_date : a), '');
      const hasCurrent = list.some((t) => t.trade_date >= cur.start && t.trade_date <= cur.end);
      setAnchor(hasCurrent || !latest ? today : latest);
    });
  }, [repo, period]);

  const range = anchor ? periodRange(period, anchor) : null;
  const prevRange = anchor ? periodRange(period, shiftPeriod(period, anchor, -1)) : null;
  const inRange = (t: StandardTrade, r: { start: string; end: string }) => t.trade_date >= r.start && t.trade_date <= r.end;

  const taken = useMemo(() => (all && range ? all.filter((t) => !isMissed(t) && inRange(t, range)) : []), [all, range?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevTaken = useMemo(() => (all && prevRange ? all.filter((t) => !isMissed(t) && inRange(t, prevRange)) : []), [all, prevRange?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const missed = useMemo(() => (all && range ? all.filter((t) => isMissed(t) && inRange(t, range)) : []), [all, range?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const perf = useMemo(() => performance(taken), [taken]);
  const prev = useMemo(() => performance(prevTaken), [prevTaken]);
  const setups = useMemo(() => breakdown(taken, getDimension('setup')), [taken]);

  if (!all || !range || !anchor) return null;
  const hasPrev = prevTaken.length > 0;
  const sorted = [...taken].sort((a, b) => b.result_r - a.result_r);
  const best = sorted.filter((t) => t.result_r > 0).slice(0, 3);
  const worst = [...sorted].reverse().filter((t) => t.result_r < 0).slice(0, 3);
  const missedR = missed.filter((t) => t.result_r > 0).reduce((a, t) => a + t.result_r, 0);
  const noun = PERIOD_NOUN[period];
  const isCurrent = range.start <= todayIso() && todayIso() <= range.end;

  return (
    <div className="page">
      <PageHeader title="Review" description={`A structured look back at each ${noun}: what worked, what didn't, and what to carry forward.`} tabs={TABS} activeTab={period} />

      <div className="period-nav">
        <button className="icon-btn" aria-label={`Previous ${noun}`} onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}>
          <Icon name="chevronRight" className="flip-x" />
        </button>
        <h2 className="period-nav__label">{range.label}</h2>
        <button className="icon-btn" aria-label={`Next ${noun}`} onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}>
          <Icon name="chevronRight" />
        </button>
        {!isCurrent && (
          <button className="btn btn--sm btn--ghost" onClick={() => setAnchor(todayIso())}>
            This {noun}
          </button>
        )}
      </div>

      {taken.length === 0 && missed.length === 0 ? (
        <div className="empty-state panel">
          <h2 className="section-title">No trades this {noun}</h2>
          <p className="muted">Use the arrows to step to a {noun} with trades.</p>
        </div>
      ) : (
        <>
          <div className="metrics metrics--6">
            <Stat label="Net R" value={fmtR(perf.netR)} tone={perf.netR > 0 ? 'positive' : perf.netR < 0 ? 'negative' : undefined} foot={<Delta value={hasPrev ? perf.netR - prev.netR : null} unit="R" />} />
            <Stat
              label="Win rate"
              value={fmtWinRate(perf.winRate)}
              foot={<Delta value={hasPrev && perf.winRate !== null && prev.winRate !== null ? Math.round((perf.winRate - prev.winRate) * 100) : null} unit="pts" />}
            />
            <Stat label="Trades" value={perf.count} foot={<Delta value={hasPrev ? perf.count - prev.count : null} unit="count" />} />
            <Stat label="Profit factor" value={perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)} foot={`Prior: ${prev.profitFactor === null ? '—' : prev.profitFactor.toFixed(2)}`} />
            <Stat label="Net P/L" value={fmtPct(perf.netPl)} tone={perf.netPl > 0 ? 'positive' : perf.netPl < 0 ? 'negative' : undefined} foot={`Expectancy ${fmtR(perf.avgR)}`} />
            <Stat label="Max drawdown" value={perf.maxDrawdownR ? `\u2212${perf.maxDrawdownR.toFixed(2)}R` : '0R'} tone={perf.maxDrawdownR ? 'negative' : undefined} foot={`Streaks ${perf.longestWinStreak}W / ${perf.longestLossStreak}L`} />
          </div>

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">Equity this {noun}</h2>
              <span className="panel__aside muted">{perf.tradingDays} trading days</span>
            </header>
            <div className="panel__body">
              <LineChart
                height={220}
                series={[{ key: 'r', label: 'Cumulative R', color: 'var(--chart-1)', points: dailyEquity(taken).map((p) => ({ date: p.date, value: p.r })) }]}
                format={(v) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}R`)}
                ariaLabel={`Cumulative R for ${range.label}: ${fmtR(perf.netR)}`}
              />
            </div>
          </section>

          <div className="grid-2">
            <TradeList title="Best trades" trades={best} />
            <TradeList title="Worst trades" trades={worst} />
          </div>

          {setups.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <h2 className="section-title">Setups this {noun}</h2>
              </header>
              <BreakdownTable rows={setups} label="Setup" />
            </section>
          )}

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">Behaviour</h2>
            </header>
            <div className="tag-lists">
              <TagList title="What went well" items={countTags(taken, listOf('positive_tags'))} empty="No positive tags." />
              <TagList title="What to work on" items={countTags(taken, listOf('negative_tags'))} empty="No negative tags." />
              <TagList title="Psychology" items={countTags([...taken, ...missed], psychologyTagsOf)} empty="No psychology tags." />
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">Missed this {noun}</h2>
              {missed.length > 0 && <a className="link small" href="#/missed">All missed trades</a>}
            </header>
            {missed.length === 0 ? (
              <p className="panel__body muted">No missed trades logged.</p>
            ) : (
              <div className="panel__body review-missed">
                <p>
                  <strong>{missed.length}</strong> missed trade{missed.length === 1 ? '' : 's'} — <span className="num-gain">{fmtR(missedR)}</span> left on the table from would-be winners.
                </p>
                <ul className="chips">
                  {missed.map((t) => (
                    <li key={t.id} className="chip">
                      {t.currency_pair} · {fmtR(t.result_r)}
                      {typeof t.optional.missed_reason === 'string' && <span className="muted"> · {t.optional.missed_reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
