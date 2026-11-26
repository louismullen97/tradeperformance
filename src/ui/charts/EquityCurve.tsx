import { useEffect, useMemo, useRef, useState } from 'react';

export interface EquityPoint {
  date: string;
  /** Cumulative R after this trade. */
  r: number;
  /** This trade's R. */
  tradeR: number;
  label?: string;
}

const PAD = { top: 12, right: 68, bottom: 26, left: 44 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmtR = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}R`;
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

/** Cumulative R over trades. Single series: no legend, the panel title names it. */
export function EquityCurve({ points, height = 220, ariaLabel }: { points: EquityPoint[]; height?: number; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    // Start the curve at 0 before the first trade so the first move is visible.
    const series = [{ date: points[0]?.date ?? '', r: 0, tradeR: 0 }, ...points];
    const values = series.map((p) => p.r);
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (series.length > 1 ? (i / (series.length - 1)) * iw : iw / 2);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;
    const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join('');
    const area = `${line}L${x(series.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { series, ticks, x, y, line, area, iw };
  }, [points, width, height]);

  if (points.length === 0) {
    return (
      <div className="chart-empty" style={{ height }}>
        No trades in this range.
      </div>
    );
  }

  const { series, ticks, x, y, line, area } = geo;
  const last = series[series.length - 1];
  const onMove = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 1;
    for (let i = 1; i < series.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const h = hover !== null ? series[hover] : null;
  const labelIdx = [1, Math.round(series.length / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i && v > 0);

  return (
    <div className="equity" ref={wrap}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis-base' : 'axis-grid'} />
            <text x={PAD.left - 8} y={y(v)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}R`}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 8} className="axis-label" textAnchor={i === 1 ? 'start' : 'middle'}>
            {fmtDate(series[i].date)}
          </text>
        ))}
        <path d={area} className="equity__area" />
        <path d={line} className="equity__line" />
        <circle cx={x(series.length - 1)} cy={y(last.r)} r={4} className="equity__end" />
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} className="equity__cross" />
            <circle cx={x(hover)} cy={y(h.r)} r={4} className="equity__end" />
          </g>
        )}
      </svg>
      <span className="equity__endlabel" style={{ top: y(last.r) - 9, left: x(series.length - 1) + 10 }}>
        {fmtR(last.r)}
      </span>
      {h && hover !== null && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 170), top: Math.max(y(h.r) - 60, 0) }}
          role="status"
        >
          <strong>{fmtR(h.r)}</strong>
          <span>cumulative · {fmtDate(h.date)}</span>
          <span>
            Trade {hover}: {fmtR(h.tradeR)}
            {'label' in h && h.label ? ` · ${h.label}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
