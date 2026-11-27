import { focusProgress, MAX_ACTIVE_FOCUS, type FocusProgress } from '../../domain/review/focus';
import type { PlanItem, PlanStatus } from '../../domain/review/daily';
import type { StandardTrade } from '../../domain/trades/types';
import { fmtDate, fmtR, Icon } from '../../ui/primitives';

const STATUS: Record<FocusProgress['status'], { label: string; tone: string }> = {
  improving: { label: 'Improving', tone: 'gain' },
  flat: { label: 'Flat', tone: 'flat' },
  worse: { label: 'Worse', tone: 'loss' },
  no_data: { label: 'No data yet', tone: 'flat' },
};

function sentence(p: FocusProgress) {
  const goalFewer = (p.item.goal ?? 'fewer') === 'fewer';
  const base = `${p.baseline.count} trade${p.baseline.count === 1 ? '' : 's'} in the 30 days before`;
  const cur = `${p.current.count} in ${p.days} day${p.days === 1 ? '' : 's'} since ${fmtDate(p.start)}`;
  if (goalFewer) return `${base} → ${cur}.`;
  return `Average ${fmtR(p.baseline.avgR)} before → ${fmtR(p.current.avgR)} since ${fmtDate(p.start)} (${p.current.count} trades).`;
}

/** Tracked focus areas with progress against their own 30-day baseline. */
export function FocusAreas({
  entries,
  trades,
  today,
  compact,
  onClose,
}: {
  entries: { key: string; item: PlanItem }[];
  trades: StandardTrade[];
  today: string;
  compact?: boolean;
  onClose?: (key: string, item: PlanItem, status: PlanStatus) => void;
}) {
  const progress = entries
    .map((e) => ({ key: e.key, p: focusProgress(e.item, trades, today, e.key.slice(e.key.indexOf(':') + 1)) }))
    .filter((x): x is { key: string; p: FocusProgress } => !!x.p);
  return (
    <section className={`panel focus-panel ${compact ? 'focus-panel--compact' : ''}`}>
      <header className="panel__head">
        <div>
          <h2 className="section-title">Focus areas</h2>
          {!compact && (
            <p className="section-sub">
              Leaks you're working on, tracked against the 30 days before you started. Keep it to {MAX_ACTIVE_FOCUS} at a time.
            </p>
          )}
        </div>
        {compact && (
          <a className="link small" href="#/review/month">
            Review <Icon name="arrowRight" size={12} />
          </a>
        )}
      </header>
      {progress.length === 0 ? (
        <p className="panel__body muted">
          No focus areas yet. In <a className="link" href="#/review/month">Review Centre → Monthly → Opportunity gaps</a>, click <strong>Make this a focus area</strong> next to a leak.
        </p>
      ) : (
        <ul className="focus-list">
          {progress.map(({ key, p }) => {
            const st = STATUS[p.status];
            return (
              <li key={p.item.id} className="focus-card">
                <div className="focus-card__head">
                  <span className="strong">{p.item.text}</span>
                  <span className={`status-pill status-pill--${st.tone}`}>{st.label}</span>
                  {p.lowSample && <span className="low-sample">Low sample</span>}
                </div>
                <p className="focus-card__text">{sentence(p)}</p>
                <div className="focus-card__foot">
                  <span className={`num ${p.rSaved > 0 ? 'num-gain' : p.rSaved < 0 ? 'num-loss' : ''}`}>
                    {p.rSaved >= 0 ? `${fmtR(p.rSaved)} saved` : `${fmtR(p.rSaved)} vs before`}
                  </span>
                  <span className="muted small">over equal-length periods</span>
                  {onClose && (
                    <span className="focus-card__actions">
                      <button className="btn btn--xs btn--ghost" onClick={() => onClose(key, p.item, 'kept')}>
                        <Icon name="check" size={12} /> Achieved
                      </button>
                      <button className="btn btn--xs btn--ghost" onClick={() => onClose(key, p.item, 'missed')}>
                        Drop
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
