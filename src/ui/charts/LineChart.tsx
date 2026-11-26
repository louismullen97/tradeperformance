import { useEffect, useMemo, useRef, useState } from 'react';

export interface LineSeries {
  key: string;
  label: string;
  /** CSS colour (use a validated palette slot or a neutral for reference lines). */
  color: string;
  points: { date: string; value: number | null }[];
  /** Reference lines (targets, pace) render thinner and without an end dot. */
  reference?: boolean;
}

const PAD = { top: 14, right: 72, bottom: 26, left: 48 };
const DAY = 86_400_000;
const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Last known value at or before `date` (series are step functions between points). */
function valueAt(s: LineSeries, date: string): number | null {
  let v: number | null = null;
  for (const p of s.points) {
    if (p.date > date) break;
    if (p.value !== null) v = p.value;
  }
  return v;
}

export function LineChart({
  series,
  height = 240,
  format,
  ariaLabel,
  baseline = 0,
  startAtZero = true,
}: {
  series: LineSeries[];
  height?: number;
  format: (v: number) => string;
  ariaLabel: string;
  /** Value drawn as the darker axis line. */
  baseline?: number | null;
  /** Prepend a zero point the day before the first point so the first move is visible. */
  startAtZero?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const prepared = useMemo(
    () =>
      series.map((s) => {
        const pts = s.points.filter((p) => p.value !== null) as { date: string; value: number }[];
        if (startAtZero && pts.length && !s.reference) {
          const first = new Date(ts(pts[0].date) - DAY).toISOString().slice(0, 10);
          return { ...s, points: [{ date: first, value: 0 }, ...s.points] };
        }
        return s;
      }),
    [series, startAtZero],
  );

  const geo = useMemo(() => {
    const all = prepared.flatMap((s) => s.points);
    const values = all.map((p) => p.value).filter((v): v is number => v !== null);
    if (!all.length || !values.length) return null;
    const dates = [...new Set(all.map((p) => p.date))].sort();
    const ticks = niceTicks(Math.min(baseline ?? Infinity, ...values), Math.max(baseline ?? -Infinity, ...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const t0 = ts(dates[0]);
    const t1 = ts(dates[dates.length - 1]);
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (d: string) => PAD.left + (t1 === t0 ? iw / 2 : ((ts(d) - t0) / (t1 - t0)) * iw);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;
    const paths = prepared.map((s) => {
      let d = '';
      let pen = false;
      for (const p of s.points) {
        if (p.value === null) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`;
        pen = true;
      }
      const last = [...s.points].reverse().find((p) => p.value !== null) as { date: string; value: number } | undefined;
      return { s, d, last };
    });
    return { dates, ticks, x, y, paths };
  }, [prepared, width, height, baseline]);

  if (!geo) {
    return (
      <div className="chart-empty" style={{ height }}>
        No data in this range.
      </div>
    );
  }
  const { dates, ticks, x, y, paths } = geo;

  // End labels only where they don't collide; otherwise the legend + tooltip carry identity.
  const ends = paths.filter((p) => p.last).map((p) => ({ ...p, ly: y(p.last!.value) }));
  const showEnd = ends.map((e, i) => ends.every((o, j) => i === j || Math.abs(o.ly - e.ly) >= 16));

  const onMove = (clientX: number) => {
    const px = clientX - wrap.current!.getBoundingClientRect().left;
    let best = dates[0];
    for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    setHover(best);
  };
  const xLabels = [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]].filter((d, i, a) => a.indexOf(d) === i);

  return (
    <div className="linechart">
      {series.length > 1 && (
        <div className="legend legend--chart">
          {series.map((s) => (
            <span key={s.key}>
              <i className={`legend__line ${s.reference ? 'legend__line--ref' : ''}`} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="equity" ref={wrap}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className={v === baseline ? 'axis-base' : 'axis-grid'} />
              <text x={PAD.left - 8} y={y(v)} className="axis-label" textAnchor="end" dominantBaseline="middle">
                {format(v)}
              </text>
            </g>
          ))}
          {xLabels.map((d, i) => (
            <text key={d} x={x(d)} y={height - 8} className="axis-label" textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>
              {dateFmt.format(new Date(ts(d)))}
            </text>
          ))}
          {paths.map(({ s, d }) => (
            <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={s.reference ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round" opacity={s.reference ? 0.8 : 1} />
          ))}
          {ends.map((e) => !e.s.reference && <circle key={e.s.key} cx={x(e.last!.date)} cy={e.ly} r={4} fill={e.s.color} stroke="var(--surface)" strokeWidth={2} />)}
          {hover && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} className="equity__cross" />
              {prepared.map((s) => {
                const v = valueAt(s, hover);
                return v === null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
              })}
            </g>
          )}
        </svg>
        {ends.map((e, i) =>
          showEnd[i] ? (
            <span key={e.s.key} className="equity__endlabel" style={{ top: e.ly - 9, left: x(e.last!.date) + 10 }}>
              {format(e.last!.value)}
            </span>
          ) : null,
        )}
        {hover && (
          <div className="chart-tip" style={{ left: Math.min(x(hover) + 12, width - 190), top: 8 }} role="status">
            <span>{dateFmt.format(new Date(ts(hover)))}</span>
            {prepared.map((s) => {
              const v = valueAt(s, hover);
              return (
                <span key={s.key} className="chart-tip__row">
                  <i className="legend__line" style={{ background: s.color }} />
                  <strong>{v === null ? '—' : format(v)}</strong> {s.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
