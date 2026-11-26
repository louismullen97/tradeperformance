import { useEffect, useMemo, useState } from 'react';
import {
  applyFilter,
  dailyEquity,
  dimensionHighlights,
  performance,
  presetRange,
  MIN_TAG_SAMPLE,
  type BreakdownRow,
  type RangePreset,
} from '../../domain/analytics/analytics';
import { getDimension } from '../../domain/analytics/dimensions';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart } from '../../ui/charts/LineChart';
import { fmtPct, fmtR, fmtWinRate, Icon } from '../../ui/primitives';
import { BreakdownTable } from './BreakdownTable';
import { PerformanceTabs, type PerformanceSub } from './PerformanceTabs';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
];

/** Palette slots 1 & 2 (validated pair): all trades vs the selected group. */
const ALL_COLOR = 'var(--series-1)';
const PICK_COLOR = 'var(--series-2)';

const fmtPF = (r: BreakdownRow['stats']) =>
  r.profitFactor === null ? (r.losses === 0 && r.wins > 0 ? '∞' : '—') : r.profitFactor.toFixed(2);

function Highlight({ title, row, foot, onPick, picked }: { title: string; row: BreakdownRow | null; foot: (r: BreakdownRow) => string; onPick: (v: string) => void; picked: boolean }) {
  if (!row)
    return (
      <div className="metric highlight">
        <div className="metric__label">{title}</div>
        <div className="highlight__value muted">—</div>
        <div className="metric__foot">Needs at least two groups</div>
      </div>
    );
  return (
    <button className={`metric highlight ${picked ? 'is-picked' : ''}`} onClick={() => onPick(row.value)} title="Compare on the chart" aria-pressed={picked}>
      <div className="metric__label">{title}</div>
      <div className="highlight__value">
        {row.value}
        {row.stats.count < MIN_TAG_SAMPLE && <span className="low-sample">Low sample</span>}
      </div>
      <div className="metric__foot">{foot(row)}</div>
    </button>
  );
}

export function DimensionPerformance({ trades: repo, sub }: { trades: TradeRepository; sub: Exclude<PerformanceSub, 'overview'> }) {
  const dim = getDimension(sub);
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [preset, setPreset] = useState<RangePreset>('all');
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => void repo.list().then((l) => setAll(takenOnly(l))), [repo]);
  useEffect(() => setPicked(null), [sub]);

  const trades = useMemo(() => applyFilter(all ?? [], { dims: {}, ...presetRange(preset) }, [dim]), [all, preset, dim]);
  const h = useMemo(() => dimensionHighlights(trades, dim), [trades, dim]);
  const pickedTrades = useMemo(() => (picked ? trades.filter((t) => dim.values(t).includes(picked)) : []), [trades, picked, dim]);
  const pickedPerf = useMemo(() => performance(pickedTrades), [pickedTrades]);
  const allPerf = useMemo(() => performance(trades), [trades]);

  const series = useMemo(() => {
    const s = [{ key: 'all', label: 'All trades', color: ALL_COLOR, points: dailyEquity(trades).map((p) => ({ date: p.date, value: p.r })) }];
    if (picked) s.push({ key: 'pick', label: `${picked} only`, color: PICK_COLOR, points: dailyEquity(pickedTrades).map((p) => ({ date: p.date, value: p.r })) });
    return s;
  }, [trades, pickedTrades, picked]);

  if (!all) return null;
  const noun = dim.label.toLowerCase();

  return (
    <div className="page">
      <PerformanceTabs active={sub} />

      {all.length === 0 ? (
        <div className="panel empty-state">
          <h2 className="step-title">Nothing to analyse yet</h2>
          <a className="btn btn--primary" href="#/imports">
            Import trades <Icon name="arrowRight" />
          </a>
        </div>
      ) : h.rows.length === 0 ? (
        <div className="panel empty-state">
          <h2 className="step-title">No {noun} data</h2>
          <p className="step-sub">Map a {noun} column on the Imports page and re-import to see this breakdown.</p>
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

          <div className="metrics">
            <Highlight title="Best performing" row={h.best} picked={picked === h.best?.value} onPick={setPicked} foot={(r) => `${fmtR(r.stats.netR)} · PF ${fmtPF(r.stats)} · ${fmtWinRate(r.stats.winRate)} win`} />
            <Highlight title="Least performing" row={h.worst} picked={picked === h.worst?.value} onPick={setPicked} foot={(r) => `${fmtR(r.stats.netR)} · PF ${fmtPF(r.stats)} · ${fmtWinRate(r.stats.winRate)} win`} />
            <Highlight title="Most frequent" row={h.mostFrequent} picked={picked === h.mostFrequent?.value} onPick={setPicked} foot={(r) => `${r.stats.count} trades · ${(r.share * 100).toFixed(0)}% of all`} />
            <Highlight title="Least frequent" row={h.leastFrequent} picked={picked === h.leastFrequent?.value} onPick={setPicked} foot={(r) => `${r.stats.count} trades · ${(r.share * 100).toFixed(0)}% of all`} />
          </div>

          <section className="panel">
            <header className="panel__head panel__head--wrap">
              <h3 className="section-title">Equity curve · all trades vs one {noun}</h3>
              <div className="pills" role="radiogroup" aria-label={`Compare a ${noun}`}>
                <button role="radio" aria-checked={picked === null} className={`pill ${picked === null ? 'is-active' : ''}`} onClick={() => setPicked(null)}>
                  All only
                </button>
                {h.rows.map((r) => (
                  <button key={r.value} role="radio" aria-checked={picked === r.value} className={`pill ${picked === r.value ? 'is-active' : ''}`} onClick={() => setPicked(r.value)}>
                    {r.value}
                  </button>
                ))}
              </div>
            </header>
            <div className="panel__body">
              <LineChart
                series={series}
                format={(v) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}R`)}
                ariaLabel={picked ? `Cumulative R: all trades ${fmtR(allPerf.netR)}, ${picked} ${fmtR(pickedPerf.netR)}` : `Cumulative R for all trades: ${fmtR(allPerf.netR)}`}
              />
              {!picked && <p className="muted hint">Pick a {noun} above (or click a card) to compare it with your overall equity.</p>}
            </div>
            {picked && (
              <div className="compare-stats">
                <div className="compare-stats__head">
                  <i className="legend__line" style={{ background: PICK_COLOR }} /> <strong>{picked}</strong>
                  <span className="muted">vs all trades</span>
                </div>
                <dl>
                  <div>
                    <dt className="eyebrow">Profit factor</dt>
                    <dd>
                      {fmtPF(pickedPerf)} <span className="muted">/ {fmtPF(allPerf)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Win rate</dt>
                    <dd>
                      {fmtWinRate(pickedPerf.winRate)} <span className="muted">/ {fmtWinRate(allPerf.winRate)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Expectancy</dt>
                    <dd>
                      {fmtR(pickedPerf.avgR)} <span className="muted">/ {fmtR(allPerf.avgR)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Net R</dt>
                    <dd>
                      {fmtR(pickedPerf.netR)} <span className="muted">/ {fmtR(allPerf.netR)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Net P/L</dt>
                    <dd>
                      {fmtPct(pickedPerf.netPl)} <span className="muted">/ {fmtPct(allPerf.netPl)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Trades</dt>
                    <dd>
                      {pickedPerf.count} <span className="muted">/ {allPerf.count}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel__head">
              <h3 className="section-title">Every {noun}</h3>
              <span className="panel__aside muted">Click a row to compare it</span>
            </header>
            <BreakdownTable rows={h.rows} label={dim.label} selected={picked} onSelect={(v) => setPicked(picked === v ? null : v)} />
          </section>
        </>
      )}
    </div>
  );
}
