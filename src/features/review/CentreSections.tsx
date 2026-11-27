import { useState } from 'react';
import type { Segment } from '../../domain/analytics/edge';
import type { DayRow, Discipline, OpportunityGaps, Panel, RepeatableTag, TradeQuality } from '../../domain/review/centre';
import type { PlanItem, PlanStatus } from '../../domain/review/daily';
import { LineChart } from '../../ui/charts/LineChart';
import { fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));
const score = (n: number | null) => (n === null ? '—' : n.toFixed(1));

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  const band = value === null ? 'none' : value >= 8 ? 'high' : value >= 5 ? 'medium' : 'low';
  return (
    <span className={`score-chip score-chip--${band}`} title={`${label}: ${value === null ? 'not logged' : `${value} / 10`}`}>
      <span className="score-chip__label">{label}</span>
      <span className="score-chip__value">{value === null ? '—' : Number(value.toFixed(1))}</span>
    </span>
  );
}

/** Week view: one card per trading day. */
export function DaySummaries({ rows, today }: { rows: DayRow[]; today: string }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Daily summaries</h2>
          <p className="section-sub">Each day's result next to how you rated it. Click a day to open its Daily ASR.</p>
        </div>
      </header>
      <div className="day-cards">
        {rows.map((d) => {
          const future = d.date > today;
          return (
            <a key={d.date} href={`#/review/day/${d.date}`} className={`day-card ${future ? 'is-future' : ''} ${d.stats.netR > 0 ? 'day-card--gain' : d.stats.netR < 0 ? 'day-card--loss' : ''}`}>
              <span className="day-card__date">{fmtDay(d.date)}</span>
              <span className={`day-card__r ${signTone(d.stats.netR)}`}>{d.trades.length ? fmtR(d.stats.netR) : future ? '' : 'No trades'}</span>
              <span className="day-card__scores">
                <ScoreChip label="Perf" value={d.performanceScore} />
                <ScoreChip label="Flow" value={d.flowScore} />
              </span>
              {d.review ? (
                <span className="day-card__tags">
                  {d.review.wins.slice(0, 2).map((t) => (
                    <span key={t} className="tag tag--gain">
                      {t}
                    </span>
                  ))}
                  {d.review.mistakes.slice(0, 2).map((t) => (
                    <span key={t} className="tag tag--loss">
                      {t}
                    </span>
                  ))}
                </span>
              ) : (
                !future && (
                  <span className="day-card__missing">
                    <Icon name="alert" size={12} /> No Daily ASR
                  </span>
                )
              )}
            </a>
          );
        })}
      </div>
    </section>
  );
}

/** Discipline metrics: logging, clean days, scores on green vs red days, good trades vs mistakes. */
export function DisciplinePanel({ d, q }: { d: Discipline; q: TradeQuality }) {
  const leaning =
    d.performanceOnGreen !== null && d.performanceOnRed !== null
      ? d.performanceOnGreen - d.performanceOnRed >= 1
        ? 'Your best-rated days are your green days — execution is driving results.'
        : d.performanceOnGreen - d.performanceOnRed <= -1
          ? 'You rated red days higher than green ones — results are coming despite execution, not because of it.'
          : 'Your self-rating barely differs between green and red days.'
      : 'Rate your performance daily to see whether good execution leads to good days.';
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Discipline</h2>
          <p className="section-sub">{leaning}</p>
        </div>
      </header>
      <div className="metrics metrics--inset">
        <Stat label="Daily ASRs logged" value={`${d.logged}/${d.days}`} foot={d.days - d.logged > 0 ? `${d.days - d.logged} day${d.days - d.logged === 1 ? '' : 's'} missing` : 'Every day logged'} />
        <Stat label="Mistake-free days" value={d.cleanRate === null ? '—' : fmtWinRate(d.cleanRate)} foot={`${d.winsCount} wins · ${d.mistakesCount} mistakes tagged`} />
        <Stat label="Avg performance" value={score(d.avgPerformance)} unit="/10" foot={`Green days ${score(d.performanceOnGreen)} · red ${score(d.performanceOnRed)}`} />
        <Stat label="Good trades" value={fmtR(q.good.netR)} tone={q.good.netR > 0 ? 'positive' : q.good.netR < 0 ? 'negative' : undefined} foot={`${q.good.count} trades tagged positive only`} />
        <Stat label="Trades with mistakes" value={fmtR(q.mistakes.netR)} tone={q.mistakes.netR < 0 ? 'negative' : q.mistakes.netR > 0 ? 'positive' : undefined} foot={`${q.mistakes.count} trades with a negative tag`} />
      </div>
    </section>
  );
}

/** Month → week panels, quarter → month panels. */
export function SubPanels({ title, panels }: { title: string; panels: Panel[] }) {
  const max = Math.max(1, ...panels.map((p) => Math.abs(p.perf.netR)));
  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="section-title">{title}</h2>
      </header>
      <div className="sub-panels" style={{ ['--cols' as string]: panels.length }}>
        {panels.map((p) => (
          <div key={p.range.start} className="sub-panel">
            <div className="sub-panel__head">
              <span className="strong">{p.label}</span>
              <span className="muted small">
                {fmtDay(p.range.start).replace(/^\w+ /, '')} – {fmtDay(p.range.end).replace(/^\w+ /, '')}
              </span>
            </div>
            <div className={`sub-panel__r ${signTone(p.perf.netR)}`}>{p.perf.count ? fmtR(p.perf.netR) : '—'}</div>
            <span className="sub-panel__bar" aria-hidden="true">
              <span className={p.perf.netR >= 0 ? 'is-gain' : 'is-loss'} style={{ width: `${(Math.abs(p.perf.netR) / max) * 100}%` }} />
            </span>
            <dl className="sub-panel__stats">
              <div>
                <dt>Trades</dt>
                <dd>{p.perf.count}</dd>
              </div>
              <div>
                <dt>Win rate</dt>
                <dd>{fmtWinRate(p.perf.winRate)}</dd>
              </div>
              <div>
                <dt>Performance</dt>
                <dd>{score(p.avgPerformance)}</dd>
              </div>
              <div>
                <dt>Flow</dt>
                <dd>{score(p.avgFlow)}</dd>
              </div>
            </dl>
            <div className="sub-panel__tags">
              {p.topWin && <span className="tag tag--gain">{p.topWin}</span>}
              {p.topMistake && <span className="tag tag--loss">{p.topMistake}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Daily performance and flow scores over the period (same 0–10 scale). */
export function ScoreTrend({ rows }: { rows: DayRow[] }) {
  const has = rows.some((r) => r.performanceScore !== null || r.flowScore !== null);
  if (!has) return null;
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Performance trend</h2>
          <p className="section-sub">Daily performance and flow scores, out of 10.</p>
        </div>
      </header>
      <div className="panel__body">
        <LineChart
          height={200}
          startAtZero={false}
          baseline={null}
          series={[
            { key: 'perf', label: 'Performance score', color: 'var(--chart-1)', points: rows.map((r) => ({ date: r.date, value: r.performanceScore })) },
            { key: 'flow', label: 'Flow score', color: 'var(--chart-2)', points: rows.map((r) => ({ date: r.date, value: r.flowScore })) },
          ]}
          format={(v) => String(Number(v.toFixed(1)))}
          ariaLabel="Daily performance and flow scores"
        />
      </div>
    </section>
  );
}

export function RepeatableTagsPanel({ tags }: { tags: RepeatableTag[] }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Repeatable tags</h2>
          <p className="section-sub">Tags that showed up 3+ times, and the R attached to them. Day tags use that day's net R.</p>
        </div>
      </header>
      {tags.length === 0 ? (
        <p className="panel__body muted">No tag appeared 3 or more times yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Type</th>
                <th className="num">Count</th>
                <th className="num">Avg R</th>
                <th className="num">Net R</th>
              </tr>
            </thead>
            <tbody>
              {tags.slice(0, 12).map((t) => (
                <tr key={t.kind + t.tag}>
                  <td>
                    <span className={`tag tag--${t.tone === 'positive' ? 'gain' : t.tone === 'negative' ? 'loss' : 'neutral'}`}>{t.tag}</span>
                  </td>
                  <td className="muted">{t.kind}</td>
                  <td className="num">{t.count}</td>
                  <td className={`num ${signTone(t.avgR)}`}>{fmtR(t.avgR)}</td>
                  <td className={`num ${signTone(t.netR)}`}>{fmtR(t.netR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function GapsPanel({ g }: { g: OpportunityGaps }) {
  const items: { icon: 'alert' | 'info'; text: React.ReactNode }[] = [];
  if (g.missedWinners)
    items.push({ icon: 'info', text: <><strong className="num-gain">{fmtR(g.missedWinnersR)}</strong> left on the table from {g.missedWinners} missed winner{g.missedWinners === 1 ? '' : 's'}.</> });
  if (g.mistakeTrades)
    items.push({ icon: 'alert', text: <><strong className={signTone(g.mistakeTradesR)}>{fmtR(g.mistakeTradesR)}</strong> from {g.mistakeTrades} trade{g.mistakeTrades === 1 ? '' : 's'} tagged with a mistake.</> });
  if (g.costliestMistake)
    items.push({ icon: 'alert', text: <>Costliest habit: <strong>{g.costliestMistake.tag}</strong> — {fmtR(g.costliestMistake.netR)} across {g.costliestMistake.count} {g.costliestMistake.kind.startsWith('Day') ? 'days' : 'trades'}.</> });
  for (const l of g.leaks)
    items.push({ icon: 'alert', text: <>Leak: <strong>{l.factors.map((f) => f.value).join(' + ')}</strong> — {fmtR(l.stats.avgR)} per trade over {l.stats.count} trades.</> });
  if (g.unloggedDays) items.push({ icon: 'info', text: <>{g.unloggedDays} trading day{g.unloggedDays === 1 ? '' : 's'} without a Daily ASR — gaps in the data hide patterns.</> });
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Opportunity gaps</h2>
          <p className="section-sub">Where R is leaking or being left behind.</p>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="panel__body muted">No gaps found. Clean month.</p>
      ) : (
        <ul className="gap-list">
          {items.map((it, i) => (
            <li key={i}>
              <Icon name={it.icon} size={14} />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PatternsPanel({ edge, needsWork }: { edge: Segment[]; needsWork: Segment[] }) {
  const list = (items: Segment[], kind: 'gain' | 'loss') =>
    items.length === 0 ? (
      <p className="muted small">Not enough evidence yet.</p>
    ) : (
      <ul className="pattern-list">
        {items.map((s) => (
          <li key={s.key}>
            <span className="strong">{s.factors.map((f) => f.value).join(' + ')}</span>
            <span className={`num num-${kind}`}>{fmtR(s.stats.avgR)}</span>
            <span className="muted small">
              {s.stats.count} trades · {fmtWinRate(s.stats.winRate)} win
            </span>
          </li>
        ))}
      </ul>
    );
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Patterns</h2>
          <p className="section-sub">What the quarter's trades say about your edge.</p>
        </div>
        <a className="link small" href="#/performance/edge">
          Full edge analysis <Icon name="arrowRight" size={12} />
        </a>
      </header>
      <div className="pattern-cols">
        <div>
          <h3 className="label">Where your edge is</h3>
          {list(edge, 'gain')}
        </div>
        <div>
          <h3 className="label">Needs work</h3>
          {list(needsWork, 'loss')}
        </div>
      </div>
    </section>
  );
}

const NEXT_STATUS: Record<PlanStatus, PlanStatus> = { open: 'kept', kept: 'missed', missed: 'open' };
const STATUS_LABEL: Record<PlanStatus, string> = { open: 'Open', kept: 'Kept', missed: 'Missed' };

/** Commitments (week), focus areas (month) or strategic objectives (quarter). */
export function PlanPanel({
  title,
  hint,
  items,
  onChange,
  nextTitle,
  nextItems,
  onNextChange,
}: {
  title: string;
  hint: string;
  items: PlanItem[];
  onChange: (items: PlanItem[]) => void;
  nextTitle: string;
  nextItems: PlanItem[];
  onNextChange: (items: PlanItem[]) => void;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-sub">{hint}</p>
        </div>
        {items.length > 0 && (
          <span className="muted small">
            {items.filter((i) => i.status === 'kept').length} of {items.length} kept
          </span>
        )}
      </header>
      <div className="plan-cols">
        <PlanList items={items} onChange={onChange} withStatus placeholder={`Add to ${title.toLowerCase()}…`} />
        <div>
          <h3 className="label">{nextTitle}</h3>
          <PlanList items={nextItems} onChange={onNextChange} placeholder="Add one…" />
        </div>
      </div>
    </section>
  );
}

function PlanList({ items, onChange, withStatus, placeholder }: { items: PlanItem[]; onChange: (items: PlanItem[]) => void; withStatus?: boolean; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: `p${Date.now().toString(36)}`, text, status: 'open' }]);
    setDraft('');
  };
  return (
    <div className="plan">
      {items.length > 0 && (
        <ul className="plan__list">
          {items.map((i) => (
            <li key={i.id} className={`plan__item plan__item--${i.status}`}>
              {withStatus && (
                <button
                  className={`plan__status plan__status--${i.status}`}
                  onClick={() => onChange(items.map((x) => (x.id === i.id ? { ...x, status: NEXT_STATUS[x.status] } : x)))}
                  title="Click to cycle: open → kept → missed"
                >
                  {i.status === 'kept' ? <Icon name="check" size={12} /> : i.status === 'missed' ? <Icon name="x" size={12} /> : null}
                  {STATUS_LABEL[i.status]}
                </button>
              )}
              <span className="plan__text">{i.text}</span>
              <button className="icon-btn" aria-label={`Remove ${i.text}`} onClick={() => onChange(items.filter((x) => x.id !== i.id))}>
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="plan__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button className="btn btn--sm btn--ghost" type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
