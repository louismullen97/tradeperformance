import { useEffect, useMemo, useState } from 'react';
import { applyFilter, presetRange, type RangePreset } from '../../domain/analytics/analytics';
import { edgeAnalysis, SHRINK_TRADES, type Segment } from '../../domain/analytics/edge';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { fmtR, fmtWinRate, Icon, Stat } from '../../ui/primitives';
import { PerformanceTabs } from './PerformanceTabs';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
];

function SegmentCard({ s, overall, kind, max }: { s: Segment; overall: number; kind: 'edge' | 'work'; max: number }) {
  const avg = s.stats.avgR ?? 0;
  const pct = Math.min(100, (Math.abs(avg) / max) * 100);
  return (
    <li className={`edge-card edge-card--${kind}`}>
      <div className="edge-card__factors">
        {s.factors.map((f) => (
          <span key={f.dimension + f.value} className="edge-factor">
            <span className="edge-factor__dim">{f.dimension}</span>
            <span className="edge-factor__value">{f.value}</span>
          </span>
        ))}
      </div>
      <div className="edge-card__stats">
        <span className={`edge-card__avg num-${kind === 'edge' ? 'gain' : 'loss'}`}>{fmtR(avg)}</span>
        <span className="edge-card__per">per trade</span>
        <span className="edge-card__bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div className="edge-card__meta">
        {s.stats.count} trades · {fmtWinRate(s.stats.winRate)} win · {fmtR(s.stats.netR)} net · {fmtR(avg - overall)} vs your average
      </div>
      <div className="edge-card__action">
        {kind === 'edge' ? (
          <>
            <Icon name="check" size={12} /> Double down — prioritise this when it appears.
          </>
        ) : (
          <>
            <Icon name="alert" size={12} /> Review or cut — tighten rules or stop taking it until it improves.
          </>
        )}
      </div>
    </li>
  );
}

export function EdgePage({ trades: repo }: { trades: TradeRepository }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [preset, setPreset] = useState<RangePreset>('all');
  useEffect(() => void repo.list().then((l) => setAll(takenOnly(l))), [repo]);

  const trades = useMemo(() => applyFilter(all ?? [], { dims: {}, ...presetRange(preset) }, []), [all, preset]);
  const report = useMemo(() => edgeAnalysis(trades), [trades]);

  if (!all) return null;
  const overall = report.overall.avgR ?? 0;
  const max = Math.max(0.5, ...[...report.edge, ...report.needsWork].map((s) => Math.abs(s.stats.avgR ?? 0)));

  return (
    <div className="page">
      <PerformanceTabs active="edge" />

      <div className="filter-bar">
        <div className="segmented" role="radiogroup" aria-label="Date range">
          {PRESETS.map((p) => (
            <button key={p.key} role="radio" aria-checked={preset === p.key} className={preset === p.key ? 'is-active' : ''} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="metrics">
        <Stat label="Your average trade" value={fmtR(report.overall.avgR)} tone={overall > 0 ? 'positive' : overall < 0 ? 'negative' : undefined} foot={`${report.overall.count} trades analysed`} />
        <Stat label="Edges found" value={report.edge.length} tone={report.edge.length ? 'positive' : undefined} foot="Consistently above your average" />
        <Stat label="Needs work" value={report.needsWork.length} tone={report.needsWork.length ? 'negative' : undefined} foot="Losing money consistently" />
        <Stat label="Evidence threshold" value={`${report.minSample}+`} foot="Trades needed before a pattern counts" />
      </div>

      {report.profile.length > 0 && (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2 className="section-title">Your A+ trade</h2>
              <p className="section-sub">The best-performing option in each category, based on trades so far.</p>
            </div>
          </header>
          <div className="profile">
            {report.profile.map(({ dimension, segment }) => (
              <div key={dimension} className="profile__item">
                <span className="profile__dim">{dimension}</span>
                <span className="profile__value">{segment.factors[0].value}</span>
                <span className="profile__stat">
                  {fmtR(segment.stats.avgR)} avg · {segment.stats.count} trades
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="edge-columns">
        <section className="edge-col">
          <header className="edge-col__head">
            <span className="edge-col__dot edge-col__dot--gain" aria-hidden="true" />
            <div>
              <h2 className="section-title">Where your edge is</h2>
              <p className="section-sub">Profitable conditions that beat your average trade.</p>
            </div>
          </header>
          {report.edge.length === 0 ? (
            <p className="edge-empty">No consistent edge yet — keep logging trades until patterns reach {report.minSample}+ trades.</p>
          ) : (
            <ul className="edge-list">
              {report.edge.map((s) => (
                <SegmentCard key={s.key} s={s} overall={overall} kind="edge" max={max} />
              ))}
            </ul>
          )}
        </section>
        <section className="edge-col">
          <header className="edge-col__head">
            <span className="edge-col__dot edge-col__dot--loss" aria-hidden="true" />
            <div>
              <h2 className="section-title">Needs work</h2>
              <p className="section-sub">Conditions where you're losing money consistently.</p>
            </div>
          </header>
          {report.needsWork.length === 0 ? (
            <p className="edge-empty">Nothing is consistently losing money. Nice.</p>
          ) : (
            <ul className="edge-list">
              {report.needsWork.map((s) => (
                <SegmentCard key={s.key} s={s} overall={overall} kind="work" max={max} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="method-note muted">
        <Icon name="info" size={12} /> Every setup, timeframe, session, pair, management style, tag and trade rating — and setup combined with each of them — is scored on
        expectancy (average R per trade). Small samples are pulled towards your overall average (as if {SHRINK_TRADES} average trades were added), so a lucky streak
        can't outrank a proven pattern. Groups need at least {report.minSample} trades to appear.
      </p>
    </div>
  );
}
