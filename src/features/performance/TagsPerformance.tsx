import { useEffect, useMemo, useState } from 'react';
import { applyFilter, presetRange, MIN_TAG_SAMPLE, type RangePreset } from '../../domain/analytics/analytics';
import { getDimension } from '../../domain/analytics/dimensions';
import { availableTagGroups, tagMatrix } from '../../domain/analytics/edge';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import type { TradeSummary } from '../../domain/trades/summary';
import type { StandardTrade } from '../../domain/trades/types';
import { fmtR, fmtWinRate, Icon } from '../../ui/primitives';
import { PerformanceTabs } from './PerformanceTabs';

const ROW_KEYS = ['setup', 'timeframe', 'currency_pair', 'trading_session', 'management_style'];
const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
];

type Metric = 'avgR' | 'winRate' | 'netR' | 'count';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'avgR', label: 'Avg R' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'netR', label: 'Net R' },
  { key: 'count', label: 'Trades' },
];

function valueOf(s: TradeSummary, m: Metric): number | null {
  if (!s.count) return null;
  if (m === 'avgR') return s.avgR;
  if (m === 'winRate') return s.winRate;
  if (m === 'netR') return s.netR;
  return s.count;
}

function format(v: number | null, m: Metric) {
  if (v === null) return '—';
  if (m === 'winRate') return fmtWinRate(v);
  if (m === 'count') return String(v);
  return fmtR(v);
}

/** Tint class + intensity (0–1). Win rate diverges around 50%; trades use a single neutral hue. */
function tint(v: number | null, m: Metric, scale: number): { cls: string; i: number } {
  if (v === null) return { cls: 'heat--empty', i: 0 };
  if (m === 'count') return { cls: 'heat--count', i: Math.min(1, v / scale) };
  const centred = m === 'winRate' ? v - 0.5 : v;
  if (centred === 0) return { cls: 'heat--flat', i: 0 };
  return { cls: centred > 0 ? 'heat--gain' : 'heat--loss', i: Math.min(1, Math.abs(centred) / scale) };
}

export function TagsPerformance({ trades: repo }: { trades: TradeRepository }) {
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [rowKey, setRowKey] = useState('setup');
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('avgR');
  const [preset, setPreset] = useState<RangePreset>('all');

  useEffect(() => void repo.list().then((l) => setAll(takenOnly(l))), [repo]);

  const trades = useMemo(() => applyFilter(all ?? [], { dims: {}, ...presetRange(preset) }, []), [all, preset]);
  const groups = useMemo(() => availableTagGroups(all ?? []), [all]);
  const rowDims = ROW_KEYS.map(getDimension).filter((d) => (all ?? []).some((t) => d.values(t).length));
  const group = groups.find((g) => g.key === groupKey) ?? groups[0];
  const rowDim = rowDims.find((d) => d.key === rowKey) ?? rowDims[0];
  const matrix = useMemo(() => (group && rowDim ? tagMatrix(trades, rowDim, group) : null), [trades, rowDim, group]);

  if (!all) return null;

  const cells = matrix ? matrix.rows.flatMap((r) => matrix.cols.map((c) => ({ r, c, s: matrix.cell(r, c).stats }))) : [];
  const vals = cells.map((x) => valueOf(x.s, metric)).filter((v): v is number => v !== null);
  const scale = metric === 'winRate' ? 0.5 : Math.max(0.0001, ...vals.map(Math.abs));
  const reliable = cells.filter((x) => x.s.count >= MIN_TAG_SAMPLE && x.s.avgR !== null);
  const best = reliable.length ? reliable.reduce((a, x) => ((x.s.avgR ?? 0) > (a.s.avgR ?? 0) ? x : a)) : null;
  const worst = reliable.length ? reliable.reduce((a, x) => ((x.s.avgR ?? 0) < (a.s.avgR ?? 0) ? x : a)) : null;

  return (
    <div className="page">
      <PerformanceTabs active="tags" />

      {groups.length === 0 ? (
        <div className="empty-state panel">
          <span className="empty-state__icon">
            <Icon name="layers" size={20} />
          </span>
          <h2 className="section-title">No tags imported yet</h2>
          <p className="muted">Map your positive, negative, psychology tags or trade rating on the Imports page and re-import.</p>
        </div>
      ) : (
        <>
          <div className="filter-bar compare-bar">
            <div className="compare-bar__group">
              <span className="label">Compare</span>
              <div className="segmented" role="radiogroup" aria-label="Rows">
                {rowDims.map((d) => (
                  <button key={d.key} role="radio" aria-checked={d.key === rowDim?.key} className={d.key === rowDim?.key ? 'is-active' : ''} onClick={() => setRowKey(d.key)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="compare-bar__group">
              <span className="label">against</span>
              <div className="segmented" role="radiogroup" aria-label="Columns">
                {groups.map((g) => (
                  <button key={g.key} role="radio" aria-checked={g.key === group?.key} className={g.key === group?.key ? 'is-active' : ''} onClick={() => setGroupKey(g.key)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filter-bar">
            <div className="segmented" role="radiogroup" aria-label="Value">
              {METRICS.map((m) => (
                <button key={m.key} role="radio" aria-checked={metric === m.key} className={metric === m.key ? 'is-active' : ''} onClick={() => setMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="segmented" role="radiogroup" aria-label="Date range">
              {PRESETS.map((p) => (
                <button key={p.key} role="radio" aria-checked={preset === p.key} className={preset === p.key ? 'is-active' : ''} onClick={() => setPreset(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {(best || worst) && (
            <div className="insight-row">
              {best && (best.s.avgR ?? 0) > 0 && (
                <p className="insight insight--gain">
                  <strong>
                    {best.r} + {best.c}
                  </strong>{' '}
                  is your strongest combination: {fmtR(best.s.avgR)} per trade over {best.s.count} trades ({fmtWinRate(best.s.winRate)} win rate).
                </p>
              )}
              {worst && (worst.s.avgR ?? 0) < 0 && (
                <p className="insight insight--loss">
                  <strong>
                    {worst.r} + {worst.c}
                  </strong>{' '}
                  costs you {fmtR(worst.s.avgR)} per trade over {worst.s.count} trades ({fmtWinRate(worst.s.winRate)} win rate).
                </p>
              )}
            </div>
          )}

          {matrix && rowDim && group && (
            <section className="panel">
              <header className="panel__head">
                <div>
                  <h2 className="section-title">
                    {rowDim.label} × {group.label}
                  </h2>
                  <p className="section-sub">
                    Each cell shows {metric === 'count' ? 'the number of trades' : METRICS.find((m) => m.key === metric)?.label} for trades with both. Faded cells have fewer than {MIN_TAG_SAMPLE} trades.
                  </p>
                </div>
              </header>
              <div className="table-wrap">
                <table className="table heatmap">
                  <thead>
                    <tr>
                      <th>{rowDim.label}</th>
                      {matrix.cols.map((c) => (
                        <th key={c} className="heatmap__col" title={c}>
                          {c}
                        </th>
                      ))}
                      <th className="num">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r) => {
                      const total = matrix.rowTotal(r);
                      return (
                        <tr key={r}>
                          <td className="strong">{r}</td>
                          {matrix.cols.map((c) => {
                            const s = matrix.cell(r, c).stats;
                            const v = valueOf(s, metric);
                            const t = tint(v, metric, scale);
                            return (
                              <td key={c} className="heatmap__td">
                                <div
                                  className={`heat ${t.cls} ${s.count > 0 && s.count < MIN_TAG_SAMPLE ? 'heat--low' : ''}`}
                                  style={{ ['--i' as string]: t.i.toFixed(3) }}
                                  title={s.count ? `${r} + ${c}: ${s.count} trades · ${fmtWinRate(s.winRate)} win · ${fmtR(s.avgR)} avg · ${fmtR(s.netR)} net` : `${r} + ${c}: no trades`}
                                >
                                  <span className="heat__value">{format(v, metric)}</span>
                                  {s.count > 0 && metric !== 'count' && <span className="heat__n">{s.count}</span>}
                                </div>
                              </td>
                            );
                          })}
                          <td className="num muted">{format(valueOf(total, metric), metric)}</td>
                        </tr>
                      );
                    })}
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
