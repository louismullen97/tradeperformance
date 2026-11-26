import { useEffect, useMemo, useState } from 'react';
import { tagDifference, MIN_TAG_SAMPLE } from '../../domain/analytics/analytics';
import { psychologyBreakdown, psychologyTagsOf, ratingBreakdown, ratingByOutcome, type PsychologyRow } from '../../domain/analytics/psychology';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { PsychologyTabs } from './PsychologyTabs';
import { fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';
import { TagAnalysis } from '../performance/PerformanceOverview';

const SOURCES = [{ key: 'psychology_tags', label: 'Psychology' }];

function CountBar({ value, max, kind }: { value: number; max: number; kind: 'gain' | 'loss' | 'missed' }) {
  return (
    <div className="count-bar">
      <span className="count-bar__track" aria-hidden="true">
        {value > 0 && <span className={`count-bar__fill count-bar__fill--${kind}`} style={{ width: `${(value / max) * 100}%` }} />}
      </span>
      <span className="num">{value}</span>
    </div>
  );
}

export function PsychologyPage({ trades: repo }: { trades: TradeRepository }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  useEffect(() => void repo.list().then(setAll), [repo]);

  const taken = useMemo(() => takenOnly(all ?? []), [all]);
  const rows = useMemo(() => psychologyBreakdown(all ?? []), [all]);
  const diff = useMemo(() => tagDifference(taken, SOURCES), [taken]);
  const ratings = useMemo(() => ratingBreakdown(taken), [taken]);
  const ratingOutcome = useMemo(() => ratingByOutcome(taken), [taken]);

  if (!all) return null;
  const tagged = (all ?? []).filter((t) => psychologyTagsOf(t).length > 0);
  const max = Math.max(1, ...rows.flatMap((r) => [r.wins, r.losses, r.missed]));
  const reliable = rows.filter((r) => !r.lowSample && r.taken > 0);
  const pool = reliable.length ? reliable : rows.filter((r) => r.taken > 0);
  const best = pool.length ? pool.reduce((a, r) => ((r.avgR ?? -Infinity) > (a.avgR ?? -Infinity) ? r : a)) : null;
  const worst = pool.length ? pool.reduce((a, r) => ((r.avgR ?? Infinity) < (a.avgR ?? Infinity) ? r : a)) : null;
  const missedMost = rows.filter((r) => r.missed > 0).sort((a, b) => b.missed - a.missed)[0] ?? null;
  const frequent = rows[0] ?? null;
  const wins = taken.filter((t) => t.result_r > 0).length;
  const losses = taken.filter((t) => t.result_r < 0).length;

  return (
    <div className="page">
      <PsychologyTabs active="overview" description="How your state of mind relates to winners, losers and the trades you didn't take." />

      {rows.length === 0 ? (
        <div className="empty-state panel">
          <span className="empty-state__icon">
            <Icon name="layers" size={20} />
          </span>
          <h2 className="section-title">No psychology tags yet</h2>
          <p className="muted">
            Add a <strong>Psychology</strong> multi-select to your Notion journal (e.g. Felt calm, Fear of losing, FOMO), tag your trades — including missed ones — and re-import.
          </p>
          <a className="btn btn--primary" href="#/imports">
            Re-import <Icon name="arrowRight" />
          </a>
        </div>
      ) : (
        <>
          <div className="metrics metrics--5">
            <Stat label="Tagged trades" value={tagged.length} foot={`${Math.round((tagged.length / Math.max(all.length, 1)) * 100)}% of all trades`} />
            <Stat label="Most frequent" value={frequent?.tag ?? '—'} foot={frequent ? `${frequent.taken + frequent.missed} trades` : undefined} />
            <Stat label="Best state" value={best?.tag ?? '—'} tone={best && (best.avgR ?? 0) > 0 ? 'positive' : undefined} foot={best ? `${fmtR(best.avgR)} avg · ${fmtWinRate(best.winRate)} win` : undefined} />
            <Stat label="Costliest state" value={worst?.tag ?? '—'} tone={worst && (worst.avgR ?? 0) < 0 ? 'negative' : undefined} foot={worst ? `${fmtR(worst.avgR)} avg · ${fmtWinRate(worst.winRate)} win` : undefined} />
            <Stat label="Behind most missed trades" value={missedMost?.tag ?? '—'} foot={missedMost ? `${missedMost.missed} missed · ${Math.round(missedMost.missedShare * 100)}% of its trades` : 'No tagged missed trades'} />
          </div>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2 className="section-title">Outcomes by psychology tag</h2>
                <p className="section-sub">Winning, losing and missed trades carrying each tag.</p>
              </div>
            </header>
            <div className="legend legend--panel">
              <span>
                <i className="legend__key legend__key--gain" /> Winners
              </span>
              <span>
                <i className="legend__key legend__key--loss" /> Losers
              </span>
              <span>
                <i className="legend__key legend__key--missed" /> Missed
              </span>
            </div>
            <div className="table-wrap">
              <table className="table psych-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th className="bar-col">Winners</th>
                    <th className="bar-col">Losers</th>
                    <th className="bar-col">Missed</th>
                    <th className="num">Win rate</th>
                    <th className="num">Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: PsychologyRow) => (
                    <tr key={r.tag} className={r.lowSample ? 'is-low' : ''}>
                      <td>
                        <span className="strong">{r.tag}</span>
                        {r.lowSample && (
                          <span className="low-sample" title={`Fewer than ${MIN_TAG_SAMPLE} trades — treat as anecdotal`}>
                            Low sample
                          </span>
                        )}
                      </td>
                      <td className="bar-col">
                        <CountBar value={r.wins} max={max} kind="gain" />
                      </td>
                      <td className="bar-col">
                        <CountBar value={r.losses} max={max} kind="loss" />
                      </td>
                      <td className="bar-col">
                        <CountBar value={r.missed} max={max} kind="missed" />
                      </td>
                      <td className="num">{fmtWinRate(r.winRate)}</td>
                      <td className={`num ${signTone(r.avgR)}`}>{fmtR(r.avgR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <TagAnalysis rows={diff} sources={SOURCES} source="all" onSource={() => {}} trades={taken} perfWins={wins} perfLosses={losses} />

          {ratings.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <div>
                  <h2 className="section-title">Execution rating vs outcome</h2>
                  <p className="section-sub">
                    Average rating on winners {ratingOutcome.wins ?? '—'} · on losers {ratingOutcome.losses ?? '—'}. A good process should hold up even when a trade loses.
                  </p>
                </div>
              </header>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rating</th>
                      <th className="num">Trades</th>
                      <th className="num">Win rate</th>
                      <th className="num">Avg R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratings.map((r) => (
                      <tr key={r.rating}>
                        <td className="strong">
                          {r.rating} / 5
                          {r.count < MIN_TAG_SAMPLE && <span className="low-sample">Low sample</span>}
                        </td>
                        <td className="num">{r.count}</td>
                        <td className="num">{fmtWinRate(r.winRate)}</td>
                        <td className={`num ${signTone(r.avgR)}`}>{fmtR(r.avgR)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
