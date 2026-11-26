import { Fragment, useEffect, useMemo, useState } from 'react';
import { breakdown, dailyEquity, performance } from '../../domain/analytics/analytics';
import { getDimension } from '../../domain/analytics/dimensions';
import type { TradeRepository } from '../../domain/trades/repository';
import { missedOnly, takenOnly } from '../../domain/trades/status';
import { outcomeOf } from '../../domain/trades/summary';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart } from '../../ui/charts/LineChart';
import { fmtDate, fmtPct, fmtR, Icon, signTone, Stat } from '../../ui/primitives';
import { BreakdownTable } from '../performance/BreakdownTable';

const REAL_COLOR = 'var(--series-1)';
const POTENTIAL_COLOR = 'var(--series-2)';

export function MissedTradesPage({ trades: repo }: { trades: TradeRepository }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [groupBy, setGroupBy] = useState<'missed_reason' | 'setup'>('missed_reason');
  useEffect(() => void repo.list().then(setAll), [repo]);

  const taken = useMemo(() => takenOnly(all ?? []), [all]);
  const missed = useMemo(() => missedOnly(all ?? []), [all]);
  const real = useMemo(() => performance(taken), [taken]);
  const potential = useMemo(() => performance([...taken, ...missed]), [taken, missed]);
  const missedWins = missed.filter((t) => outcomeOf(t) === 'win');
  const missedLosses = missed.filter((t) => outcomeOf(t) === 'loss');
  const leftOnTable = missedWins.reduce((a, t) => a + t.result_r, 0);
  const avoided = -missedLosses.reduce((a, t) => a + t.result_r, 0);
  const hasReason = missed.some((t) => typeof t.optional.missed_reason === 'string');
  const dim = getDimension(hasReason ? groupBy : 'setup');
  const rows = useMemo(() => breakdown(missed, dim), [missed, dim]);

  const series = useMemo(
    () => [
      { key: 'real', label: 'Real equity (trades taken)', color: REAL_COLOR, points: dailyEquity(taken).map((p) => ({ date: p.date, value: p.r })) },
      { key: 'potential', label: 'Potential equity (incl. missed)', color: POTENTIAL_COLOR, points: dailyEquity([...taken, ...missed]).map((p) => ({ date: p.date, value: p.r })) },
    ],
    [taken, missed],
  );

  if (!all) return null;

  return (
    <div className="page">
      <header className="wizard__head">
        <div className="wizard__title">
          <span className="source-mark" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <div>
            <div className="eyebrow">Analyse · Missed trades</div>
            <h1>Missed trades</h1>
          </div>
        </div>
      </header>

      {missed.length === 0 ? (
        <div className="panel empty-state">
          <span className="empty-state__icon">
            <Icon name="search" size={20} />
          </span>
          <h2 className="step-title">No missed trades logged yet</h2>
          <p className="step-sub">
            Log missed trades in the same Notion journal: set <strong>Trade Status</strong> to <strong>Missed</strong>, add the <strong>Missed Reason</strong>, and fill in Risk and Result as
            the trade would have played out. Then re-import — missed trades stay out of your journal and performance stats and appear only here.
          </p>
          <a className="btn btn--primary" href="#/imports">
            Re-import <Icon name="arrowRight" />
          </a>
        </div>
      ) : (
        <>
          <div className="stat-row stat-row--5">
            <Stat label="Missed trades" value={missed.length} foot={`${missedWins.length} would-be wins · ${missedLosses.length} losses`} />
            <Stat label="Left on the table" value={fmtR(leftOnTable)} tone={leftOnTable > 0 ? 'positive' : undefined} foot="R from missed winners" />
            <Stat label="Losses avoided" value={fmtR(avoided)} foot="R from missed losers" />
            <Stat label="Real net R" value={fmtR(real.netR)} tone={real.netR >= 0 ? 'positive' : 'negative'} foot={`${real.count} trades taken`} />
            <Stat
              label="Potential net R"
              value={fmtR(potential.netR)}
              tone={potential.netR >= 0 ? 'positive' : 'negative'}
              foot={`${fmtR(potential.netR - real.netR)} vs real`}
            />
          </div>

          <section className="panel">
            <header className="panel__head">
              <h3 className="eyebrow">Real vs potential equity · cumulative R</h3>
            </header>
            <div className="panel__body">
              <LineChart
                series={series}
                format={(v) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}R`)}
                ariaLabel={`Real equity ${fmtR(real.netR)} versus potential equity including missed trades ${fmtR(potential.netR)}`}
              />
            </div>
          </section>

          <section className="panel">
            <header className="panel__head panel__head--wrap">
              <h3 className="eyebrow">Missed trades by</h3>
              {hasReason && (
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={groupBy === 'missed_reason'} className={`tab ${groupBy === 'missed_reason' ? 'is-active' : ''}`} onClick={() => setGroupBy('missed_reason')}>
                    Reason
                  </button>
                  <button role="tab" aria-selected={groupBy === 'setup'} className={`tab ${groupBy === 'setup' ? 'is-active' : ''}`} onClick={() => setGroupBy('setup')}>
                    Setup
                  </button>
                </div>
              )}
            </header>
            <BreakdownTable rows={rows} label={dim.label} />
            <p className="panel__note muted">
              <Icon name="info" size={12} /> Figures are what the missed trades would have made. A positive Net R means the misses cost you; negative means skipping them helped.
            </p>
          </section>

          <section className="panel">
            <header className="panel__head">
              <h3 className="eyebrow">Missed trades · {missed.length}</h3>
            </header>
            <div className="table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pair</th>
                    <th>Setup</th>
                    <th>Reason</th>
                    <th className="num">Would have made</th>
                    <th className="num">P/L %</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {[...missed]
                    .sort((a, b) => b.trade_date.localeCompare(a.trade_date))
                    .map((t) => (
                      <Fragment key={t.id}>
                        <tr>
                          <td>{fmtDate(t.trade_date)}</td>
                          <td className="strong">{t.currency_pair}</td>
                          <td>{t.setup}</td>
                          <td>{typeof t.optional.missed_reason === 'string' ? t.optional.missed_reason : <span className="muted">—</span>}</td>
                          <td className={`num ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</td>
                          <td className={`num ${signTone(t.profit_loss_percentage)}`}>{fmtPct(t.profit_loss_percentage)}</td>
                          <td>
                            {t.source.recordUrl && (
                              <a className="icon-btn" href={t.source.recordUrl} target="_blank" rel="noreferrer" aria-label="Open in Notion">
                                <Icon name="external" size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
