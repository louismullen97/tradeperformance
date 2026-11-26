import { useEffect, useMemo, useState } from 'react';
import {
  applyFilter,
  availableTagSources,
  breakdown,
  performance,
  presetRange,
  tagDifference,
  MIN_TAG_SAMPLE,
  type RangePreset,
  type TradeFilter,
} from '../../domain/analytics/analytics';
import { availableDimensions, distinctValues, getDimension } from '../../domain/analytics/dimensions';
import type { TradeRepository } from '../../domain/trades/repository';
import { cumulativeR } from '../../domain/trades/summary';
import type { StandardTrade } from '../../domain/trades/types';
import { EquityCurve } from '../../ui/charts/EquityCurve';
import { takenOnly } from '../../domain/trades/status';
import { BreakdownTable } from './BreakdownTable';
import { PerformanceTabs } from './PerformanceTabs';
import { FilterSelect } from '../../ui/FilterSelect';
import { Badge, fmtPct, fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
];

/** Dimensions offered as filters, in the order traders think about them. */
const FILTER_KEYS = ['setup', 'timeframe', 'management_style', 'trading_session', 'currency_pair', 'direction', 'entry_type', 'account'];

export function PerformanceOverview({ trades: repo }: { trades: TradeRepository }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [preset, setPreset] = useState<RangePreset>('all');
  const [dims, setDims] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState('setup');
  const [tagSource, setTagSource] = useState<string>('all');

  useEffect(() => void repo.list().then((l) => setAll(takenOnly(l))), [repo]);

  const dimensions = useMemo(() => availableDimensions(all ?? []), [all]);
  const filterDims = FILTER_KEYS.map((k) => dimensions.find((d) => d.key === k)).filter((d) => !!d);
  const filter: TradeFilter = { dims, ...presetRange(preset) };
  const trades = useMemo(() => applyFilter(all ?? [], filter, dimensions), [all, dims, preset, dimensions]); // eslint-disable-line react-hooks/exhaustive-deps
  const perf = useMemo(() => performance(trades), [trades]);
  const equity = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    return cumulativeR(sorted).map((p, i) => ({ ...p, tradeR: sorted[i].result_r, label: `${sorted[i].currency_pair} ${sorted[i].setup}` }));
  }, [trades]);

  const groupDims = dimensions.filter((d) => !dims[d.key] || d.key === 'weekday');
  const activeGroup = groupDims.find((d) => d.key === groupBy) ?? groupDims[0];
  const rows = useMemo(() => (activeGroup ? breakdown(trades, activeGroup) : []), [trades, activeGroup]);

  const tagSources = useMemo(() => availableTagSources(all ?? []), [all]);
  const tagRows = useMemo(
    () => tagDifference(trades, tagSource === 'all' ? tagSources : tagSources.filter((s) => s.key === tagSource)),
    [trades, tagSources, tagSource],
  );

  if (!all) return null;
  const filtered = preset !== 'all' || Object.values(dims).some(Boolean);

  return (
    <div className="page">
      <PerformanceTabs active="overview" />

      {all.length === 0 ? (
        <div className="panel empty-state">
          <h2 className="step-title">Nothing to analyse yet</h2>
          <p className="step-sub">Import a journal to see breakdowns by setup, session and tags.</p>
          <a className="btn btn--primary" href="#/imports">
            Import trades <Icon name="arrowRight" />
          </a>
        </div>
      ) : (
        <>
          {/* One filter row, above everything it affects. */}
          <div className="filter-bar">
            <div className="segmented" role="radiogroup" aria-label="Date range">
              {PRESETS.map((p) => (
                <button key={p.key} role="radio" aria-checked={preset === p.key} className={preset === p.key ? 'is-active' : ''} onClick={() => setPreset(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="filters">
              {filterDims.map((d) => (
                <FilterSelect
                  key={d.key}
                  label={d.label}
                  value={dims[d.key] ?? ''}
                  options={distinctValues(all, d)}
                  onChange={(v) => setDims({ ...dims, [d.key]: v })}
                />
              ))}
              {filtered && (
                <button
                  className="btn btn--xs btn--ghost"
                  onClick={() => {
                    setDims({});
                    setPreset('all');
                  }}
                >
                  <Icon name="x" size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="stat-row stat-row--6">
            <Stat label={filtered ? 'Trades (filtered)' : 'Trades'} value={perf.count} foot={`${perf.wins}W · ${perf.losses}L · ${perf.breakeven} BE`} />
            <Stat label="Win rate" value={fmtWinRate(perf.winRate)} foot="Breakevens excluded" />
            <Stat label="Net R" value={fmtR(perf.netR)} tone={perf.netR > 0 ? 'positive' : perf.netR < 0 ? 'negative' : undefined} foot={`Net ${fmtPct(perf.netPl)}`} />
            <Stat label="Expectancy" value={fmtR(perf.avgR)} foot={`Avg win ${fmtR(perf.avgWinR)} · loss ${fmtR(perf.avgLossR)}`} />
            <Stat label="Profit factor" value={perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)} foot="R won ÷ R lost" />
            <Stat label="Max drawdown" value={perf.maxDrawdownR ? `-${perf.maxDrawdownR.toFixed(2)}R` : '0R'} tone={perf.maxDrawdownR ? 'negative' : undefined} foot={`Streaks ${perf.longestWinStreak}W / ${perf.longestLossStreak}L`} />
          </div>

          <section className="panel">
            <header className="panel__head">
              <h3 className="eyebrow">Equity curve · cumulative R</h3>
              <span className="panel__aside muted">{trades.length} trades</span>
            </header>
            <div className="panel__body">
              <EquityCurve points={equity} height={240} ariaLabel={`Cumulative R for the filtered trades, ending at ${fmtR(perf.netR)}`} />
            </div>
          </section>

          {activeGroup && (
            <section className="panel">
              <header className="panel__head panel__head--wrap">
                <h3 className="eyebrow">Breakdown</h3>
                <div className="tabs" role="tablist" aria-label="Group by">
                  {groupDims.map((d) => (
                    <button key={d.key} role="tab" aria-selected={activeGroup.key === d.key} className={`tab ${activeGroup.key === d.key ? 'is-active' : ''}`} onClick={() => setGroupBy(d.key)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </header>
              <BreakdownTable rows={rows} label={getDimension(activeGroup.key).label} />
            </section>
          )}

          <TagAnalysis rows={tagRows} sources={tagSources} source={tagSource} onSource={setTagSource} trades={trades} perfWins={perf.wins} perfLosses={perf.losses} />
        </>
      )}
    </div>
  );
}

function TagAnalysis({
  rows,
  sources,
  source,
  onSource,
  trades,
  perfWins,
  perfLosses,
}: {
  rows: ReturnType<typeof tagDifference>;
  sources: ReturnType<typeof availableTagSources>;
  source: string;
  onSource: (s: string) => void;
  trades: StandardTrade[];
  perfWins: number;
  perfLosses: number;
}) {
  return (
    <section className="panel">
      <header className="panel__head panel__head--wrap">
        <div>
          <h3 className="eyebrow">Tag analysis · winners vs losers</h3>
          <p className="panel__sub">
            How often each tag appears on winning trades compared with losing trades, across {perfWins} wins and {perfLosses} losses.
          </p>
        </div>
        {sources.length > 1 && (
          <div className="tabs" role="tablist" aria-label="Tag group">
            <button role="tab" aria-selected={source === 'all'} className={`tab ${source === 'all' ? 'is-active' : ''}`} onClick={() => onSource('all')}>
              All
            </button>
            {sources.map((s) => (
              <button key={s.key} role="tab" aria-selected={source === s.key} className={`tab ${source === s.key ? 'is-active' : ''}`} onClick={() => onSource(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {sources.length === 0 ? (
        <div className="panel__body muted">
          No tags imported yet. Map your Positive / Negative tag columns on the <a className="link" href="#/imports">Imports</a> page and re-import.
        </div>
      ) : rows.length === 0 || trades.length === 0 ? (
        <div className="panel__body muted">No tagged trades in this selection.</div>
      ) : (
        <>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="legend__key legend__key--gain" /> Share of winning trades with the tag
            </span>
            <span>
              <i className="legend__key legend__key--loss" /> Share of losing trades with the tag
            </span>
          </div>
          <div className="table-wrap">
            <table className="preview-table tag-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th className="bar-col">On winners</th>
                  <th className="bar-col">On losers</th>
                  <th className="num">Difference</th>
                  <th className="num">Win rate with / without</th>
                  <th className="num">Avg R with</th>
                  <th className="num">Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.source}:${r.tag}`} className={r.lowSample ? 'is-low' : ''}>
                    <td>
                      <div className="tag-cell">
                        <span className="strong">{r.tag}</span>
                        <Badge tone={r.source === 'Negative' ? 'negative' : r.source === 'Positive' ? 'positive' : 'neutral'}>{r.source}</Badge>
                        {r.lowSample && (
                          <span className="low-sample" title={`Only ${r.trades} trade${r.trades === 1 ? '' : 's'} — not enough to draw conclusions`}>
                            low sample
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="bar-col">
                      <ShareBar value={r.inWins} kind="gain" />
                    </td>
                    <td className="bar-col">
                      <ShareBar value={r.inLosses} kind="loss" />
                    </td>
                    <td className="num strong">
                      {r.difference > 0 ? '+' : ''}
                      {(r.difference * 100).toFixed(0)} pts
                    </td>
                    <td className="num">
                      {fmtWinRate(r.winRateWith)} <span className="muted">/ {fmtWinRate(r.winRateWithout)}</span>
                    </td>
                    <td className={`num ${signTone(r.avgRWith)}`}>{fmtR(r.avgRWith)}</td>
                    <td className="num">{r.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel__note muted">
            <Icon name="info" size={12} /> “Difference” is the share on winners minus the share on losers. Tags on fewer than {MIN_TAG_SAMPLE} trades are
            marked low sample — the pattern may be noise until you have more data.
          </p>
        </>
      )}
    </section>
  );
}

function ShareBar({ value, kind }: { value: number; kind: 'gain' | 'loss' }) {
  return (
    <div className="share">
      <span className="share__track" aria-hidden="true">
        {value > 0 && <span className={`share__fill share__fill--${kind}`} style={{ width: `${value * 100}%` }} />}
      </span>
      <span className="num">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}
