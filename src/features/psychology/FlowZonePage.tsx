import { useEffect, useMemo, useState } from 'react';
import { presetRange, type RangePreset } from '../../domain/analytics/analytics';
import {
  dailyFlow,
  flowByDayOutcome,
  flowByTimeOfDay,
  flowCorrelation,
  flowTagImpact,
  tradesByFlowBand,
  type FlowEntry,
  type FlowRepository,
} from '../../domain/flow/flow';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart } from '../../ui/charts/LineChart';
import { fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';
import { PsychologyTabs } from './PsychologyTabs';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];

function describeCorrelation(r: number) {
  const a = Math.abs(r);
  const strength = a >= 0.6 ? 'Strong' : a >= 0.3 ? 'Moderate' : a >= 0.1 ? 'Weak' : 'No clear';
  const dir = r > 0.1 ? 'higher flow, better results' : r < -0.1 ? 'higher flow, worse results' : 'link';
  return a < 0.1 ? 'No clear link between flow and results' : `${strength}: ${dir}`;
}

function TagImpact({ title, rows, empty }: { title: string; rows: { tag: string; count: number; avg: number }[]; empty: string }) {
  return (
    <div className="tag-list">
      <h3 className="label">{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul>
          {rows.slice(0, 6).map((r) => (
            <li key={r.tag}>
              <span className="tag-list__name">{r.tag}</span>
              <span className="tag-list__bar flow-bar" aria-hidden="true">
                <span style={{ width: `${(r.avg / 10) * 100}%` }} />
              </span>
              <span className="num" title={`Average flow ${r.avg} across ${r.count} check-ins`}>
                {r.avg.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FlowZonePage({ trades: tradeRepo, flow: flowRepo }: { trades: TradeRepository; flow: FlowRepository }) {
  const [entriesAll, setEntries] = useState<FlowEntry[] | null>(null);
  const [tradesAll, setTrades] = useState<StandardTrade[]>([]);
  const [preset, setPreset] = useState<RangePreset>('all');

  useEffect(() => {
    void Promise.all([flowRepo.list(), tradeRepo.list()]).then(([f, t]) => {
      setEntries(f);
      setTrades(takenOnly(t));
    });
  }, [flowRepo, tradeRepo]);

  const range = presetRange(preset);
  const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
  const entries = useMemo(() => (entriesAll ?? []).filter((e) => inRange(e.date)), [entriesAll, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const trades = useMemo(() => tradesAll.filter((t) => inRange(t.trade_date)), [tradesAll, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => dailyFlow(entries), [entries]);
  const bands = useMemo(() => tradesByFlowBand(trades, days), [trades, days]);
  const outcome = useMemo(() => flowByDayOutcome(trades, days), [trades, days]);
  const corr = useMemo(() => flowCorrelation(trades, days), [trades, days]);
  const slots = useMemo(() => flowByTimeOfDay(entries), [entries]);
  const boosters = useMemo(() => flowTagImpact(entries, 'positive'), [entries]);
  const drains = useMemo(() => flowTagImpact(entries, 'negative'), [entries]);

  if (!entriesAll) return null;
  const avg = entries.length ? entries.reduce((a, e) => a + e.score, 0) / entries.length : null;
  const bestSlot = slots.filter((s) => s.slot !== 'Unspecified').sort((a, b) => b.avg - a.avg)[0];

  return (
    <div className="page">
      <PsychologyTabs
        active="flow"
        description="Flow Zone is a 1–10 score you log daily — ideally three times a day — to see how your state changes and how it affects your trading."
      />

      {entriesAll.length === 0 ? (
        <div className="empty-state panel">
          <span className="empty-state__icon">
            <Icon name="sparkle" size={20} />
          </span>
          <h2 className="section-title">Start logging your Flow Zone</h2>
          <p className="muted">
            Create a <strong>Flow Log</strong> database in Notion with Date, Time of day, Flow (1–10), Positive flow and Negative flow. Check in each morning, midday and
            afternoon, then import it on the Imports page as a <strong>Flow log</strong>.
          </p>
          <a className="btn btn--primary" href="#/imports">
            Import flow log <Icon name="arrowRight" />
          </a>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="segmented" role="radiogroup" aria-label="Date range">
              {PRESETS.map((p) => (
                <button key={p.key} role="radio" aria-checked={preset === p.key} className={preset === p.key ? 'is-active' : ''} onClick={() => setPreset(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="metrics metrics--5">
            <Stat label="Average flow" value={avg === null ? '—' : avg.toFixed(1)} unit="/ 10" foot={`${entries.length} check-ins over ${days.size} days`} />
            <Stat label="Flow on green days" value={outcome.green === null ? '—' : outcome.green.toFixed(1)} tone="positive" foot={`${outcome.greenDays} profitable days`} />
            <Stat label="Flow on red days" value={outcome.red === null ? '—' : outcome.red.toFixed(1)} tone="negative" foot={`${outcome.redDays} losing days`} />
            <Stat label="Flow vs results" value={corr ? (corr.r > 0 ? '+' : '') + corr.r.toFixed(2) : '—'} foot={corr ? describeCorrelation(corr.r) : 'Needs 5+ trading days with flow'} />
            <Stat label="Best time of day" value={bestSlot?.slot ?? '—'} foot={bestSlot ? `Average ${bestSlot.avg.toFixed(1)} across ${bestSlot.count} check-ins` : 'Log a time of day'} />
          </div>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2 className="section-title">Daily flow</h2>
                <p className="section-sub">Average of each day's check-ins.</p>
              </div>
            </header>
            <div className="panel__body">
              <LineChart
                height={220}
                startAtZero={false}
                baseline={null}
                series={[{ key: 'flow', label: 'Average flow', color: 'var(--chart-1)', points: [...days.values()].map((d) => ({ date: d.date, value: d.avg })) }]}
                format={(v) => v.toFixed(v % 1 ? 1 : 0)}
                ariaLabel={`Daily average flow, currently ${avg?.toFixed(1) ?? 'unknown'} out of 10`}
              />
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2 className="section-title">Results by flow</h2>
                <p className="section-sub">
                  Trades grouped by your average flow on the day they were taken.
                  {bands.unmatched > 0 && ` ${bands.unmatched} trade${bands.unmatched === 1 ? ' was' : 's were'} on days without a check-in.`}
                </p>
              </div>
            </header>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Flow</th>
                    <th className="num">Days</th>
                    <th className="num">Trades</th>
                    <th className="num">Win rate</th>
                    <th className="num">Avg R</th>
                    <th className="num">Net R</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.rows.map((r) => (
                    <tr key={r.band.key}>
                      <td className="strong">
                        <span className={`flow-dot flow-dot--${r.band.key}`} aria-hidden="true" /> {r.band.label}
                      </td>
                      <td className="num">{r.days}</td>
                      <td className="num">{r.stats.count}</td>
                      <td className="num">{fmtWinRate(r.stats.winRate)}</td>
                      <td className={`num ${signTone(r.stats.avgR)}`}>{fmtR(r.stats.avgR)}</td>
                      <td className={`num ${signTone(r.stats.netR)}`}>{r.stats.count ? fmtR(r.stats.netR) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">What moves your flow</h2>
            </header>
            <div className="tag-lists">
              <div className="tag-list">
                <h3 className="label">Through the day</h3>
                <ul>
                  {slots.map((s) => (
                    <li key={s.slot}>
                      <span className="tag-list__name">{s.slot}</span>
                      <span className="tag-list__bar flow-bar" aria-hidden="true">
                        <span style={{ width: `${(s.avg / 10) * 100}%` }} />
                      </span>
                      <span className="num">{s.avg.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <TagImpact title="Lifts your flow" rows={boosters} empty="No positive flow tags logged." />
              <TagImpact title="Drains your flow" rows={drains} empty="No negative flow tags logged." />
            </div>
            <p className="panel__note muted">
              <Icon name="info" size={12} /> Bars show the average flow score on check-ins carrying each tag or time of day.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
