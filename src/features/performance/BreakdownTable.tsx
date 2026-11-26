import { MIN_TAG_SAMPLE, type BreakdownRow } from '../../domain/analytics/analytics';
import { fmtPct, fmtR, fmtWinRate, signTone } from '../../ui/primitives';

/** Horizontal bar growing left (loss) or right (gain) from a shared zero line. */
export function DivergingBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = (Math.abs(value) / max) * 50;
  return (
    <div className="dbar" title={label}>
      <span className="dbar__track" aria-hidden="true">
        <span className="dbar__zero" />
        {value !== 0 && (
          <span className={`dbar__fill dbar__fill--${value > 0 ? 'gain' : 'loss'}`} style={value > 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
        )}
      </span>
      <span className={`num ${signTone(value)}`}>{label}</span>
    </div>
  );
}

export function BreakdownTable({
  rows,
  label,
  selected,
  onSelect,
}: {
  rows: BreakdownRow[];
  label: string;
  selected?: string | null;
  onSelect?: (value: string) => void;
}) {
  const maxAbsR = Math.max(1, ...rows.map((r) => Math.abs(r.stats.netR)));
  return (
    <div className="table-wrap">
      <table className="preview-table breakdown-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Trades</th>
            <th>Win rate</th>
            <th className="bar-col">Net R</th>
            <th className="num">Expectancy</th>
            <th className="num">P/L %</th>
            <th className="num">Profit factor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.value}
              className={`${onSelect ? 'is-clickable' : ''} ${selected === r.value ? 'is-selected' : ''}`}
              onClick={onSelect ? () => onSelect(r.value) : undefined}
            >
              <td className="strong">
                {r.value}
                {r.stats.count < MIN_TAG_SAMPLE && (
                  <span className="low-sample" title={`Fewer than ${MIN_TAG_SAMPLE} trades — treat as anecdotal`}>
                    Low sample
                  </span>
                )}
              </td>
              <td className="num">
                {r.stats.count} <span className="muted">· {(r.share * 100).toFixed(0)}%</span>
              </td>
              <td>
                <div className="winrate">
                  <span className="winrate__bar" aria-hidden="true">
                    <span style={{ width: `${(r.stats.winRate ?? 0) * 100}%` }} />
                  </span>
                  <span className="num">{fmtWinRate(r.stats.winRate)}</span>
                </div>
              </td>
              <td className="bar-col">
                <DivergingBar value={r.stats.netR} max={maxAbsR} label={fmtR(r.stats.netR)} />
              </td>
              <td className={`num ${signTone(r.stats.avgR)}`}>{fmtR(r.stats.avgR)}</td>
              <td className={`num ${signTone(r.stats.netPl)}`}>{fmtPct(r.stats.netPl)}</td>
              <td className="num">{r.stats.profitFactor === null ? (r.stats.losses === 0 && r.stats.wins > 0 ? '∞' : '—') : r.stats.profitFactor.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
