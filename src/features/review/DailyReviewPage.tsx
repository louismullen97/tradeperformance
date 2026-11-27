import { useEffect, useMemo, useState } from 'react';
import { dailyFlow, type FlowEntry, type FlowRepository } from '../../domain/flow/flow';
import { dayRows } from '../../domain/review/centre';
import { DAILY_TAGS, emptyDaily, hasContent, type DailyRepository, type DailyReview } from '../../domain/review/daily';
import type { SourceDataset } from '../../domain/source/types';
import type { TradeRepository } from '../../domain/trades/repository';
import { isMissed } from '../../domain/trades/status';
import { summarise } from '../../domain/trades/summary';
import type { StandardTrade } from '../../domain/trades/types';
import { periodRange } from '../../domain/analytics/review';
import { syncDailyReview } from '../../sources/http/reviewPublisher';
import { centreTarget } from '../../domain/centre/settings';
import { fmtR, fmtWinRate, Icon, signTone, Spinner, Stat } from '../../ui/primitives';
import type { ReviewPublishing } from './ReviewPage';

const DAY = 86_400_000;
const TARGET_KEY = 'tradelens.daily.target.v1';
const SYNC_KEY = 'tradelens.daily.sync.v1';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/** Next/previous weekday. */
function stepDay(date: string, dir: 1 | -1) {
  let d = new Date(`${date}T00:00:00Z`);
  do d = new Date(d.getTime() + dir * DAY);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return iso(d);
}
function lastWeekday(date: string) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6 ? stepDay(date, -1) : date;
}
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* optional */
  }
};

function ScorePicker({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: React.ReactNode }) {
  return (
    <div className="daily-field">
      <div className="daily-field__head">
        <span className="label">{label}</span>
        <span className="daily-field__value">{value === null ? 'Not rated' : `${value} / 10`}</span>
      </div>
      <div className="score-picker" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            className={`score-picker__btn ${value === n ? 'is-active' : ''} ${value !== null && n <= value ? 'is-filled' : ''} score-picker__btn--${n >= 8 ? 'high' : n >= 5 ? 'medium' : 'low'}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {hint && <div className="daily-field__hint">{hint}</div>}
    </div>
  );
}

function TagPicker({ label, tone, options, value, onChange }: { label: string; tone: 'gain' | 'loss' | 'neutral'; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const all = [...new Set([...options, ...value])];
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div className="daily-field">
      <span className="label">{label}</span>
      <div className="tag-picker">
        {all.map((t) => (
          <button key={t} className={`tag-toggle tag-toggle--${tone} ${value.includes(t) ? 'is-active' : ''}`} aria-pressed={value.includes(t)} onClick={() => toggle(t)}>
            {value.includes(t) && <Icon name="check" size={11} />}
            {t}
          </button>
        ))}
        <form
          className="tag-picker__add"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim().replace(/,/g, ' ');
            if (t && !value.includes(t)) onChange([...value, t]);
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ Add tag" aria-label={`Add a ${label.toLowerCase()} tag`} />
        </form>
      </div>
    </div>
  );
}

function TextField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="daily-field">
      <span className="label">{label}</span>
      <textarea className="textarea" rows={2} placeholder={placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
    </label>
  );
}

type SyncState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; url?: string; local: boolean } | { kind: 'error'; message: string };

export function DailyReviewPage({
  trades: tradeRepo,
  flow: flowRepo,
  daily: dailyRepo,
  publishing,
  date: routeDate,
}: {
  trades: TradeRepository;
  flow?: FlowRepository;
  daily: DailyRepository;
  publishing: ReviewPublishing;
  date?: string;
}) {
  const [date, setDate] = useState(() => routeDate ?? lastWeekday(todayIso()));
  const [trades, setTrades] = useState<StandardTrade[] | null>(null);
  const [flow, setFlow] = useState<FlowEntry[]>([]);
  const [reviews, setReviews] = useState<DailyReview[]>([]);
  const [entry, setEntry] = useState<DailyReview>(() => emptyDaily(date));
  const [dirty, setDirty] = useState(false);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  // Default to syncing when the Trading Centre has a Daily ASR database, unless the user turned it off.
  const [toNotion, setToNotion] = useState(() => (read(SYNC_KEY) ?? (centreTarget('daily') ? '1' : '0')) === '1');
  const [target, setTarget] = useState(() => read(TARGET_KEY) ?? centreTarget('daily') ?? '');
  const [datasets, setDatasets] = useState<SourceDataset[] | null>(null);

  useEffect(() => void tradeRepo.list().then(setTrades), [tradeRepo]);
  useEffect(() => void flowRepo?.list().then(setFlow), [flowRepo]);
  useEffect(() => void dailyRepo.list().then(setReviews), [dailyRepo]);
  useEffect(() => {
    if (routeDate) setDate(routeDate);
  }, [routeDate]);
  useEffect(() => {
    void dailyRepo.get(date).then((e) => {
      setEntry(e ?? emptyDaily(date));
      setDirty(false);
      setSync({ kind: 'idle' });
    });
  }, [dailyRepo, date]);
  useEffect(() => {
    if (!publishing.live || !toNotion || datasets) return;
    publishing.connector
      .listDatasets()
      .then((list) => {
        setDatasets(list);
        if (!target) {
          const guess = list.find((d) => /daily/i.test(d.name) && /asr|review/i.test(d.name)) ?? list.find((d) => /daily/i.test(d.name));
          if (guess) setTarget(guess.id);
        }
      })
      .catch(() => setDatasets([]));
  }, [publishing, toNotion, datasets, target]);

  const dayTrades = useMemo(() => (trades ?? []).filter((t) => t.trade_date === date), [trades, date]);
  const taken = dayTrades.filter((t) => !isMissed(t));
  const missed = dayTrades.filter(isMissed);
  const stats = summarise(taken);
  const checkins = useMemo(() => flow.filter((e) => e.date === date).sort((a, b) => (a.timeOfDay ?? '').localeCompare(b.timeOfDay ?? '')), [flow, date]);
  const flowAvg = dailyFlow(checkins).get(date)?.avg ?? null;
  const week = periodRange('week', date);
  const weekRows = useMemo(
    () => dayRows(week, (trades ?? []).filter((t) => !isMissed(t)), reviews.map((r) => (r.date === entry.date ? entry : r)), flow),
    [week.start, trades, reviews, entry, flow], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const usedTags = (key: 'wins' | 'mistakes' | 'emotions') => [...new Set([...DAILY_TAGS[key], ...reviews.flatMap((r) => r[key])])];

  const update = (patch: Partial<DailyReview>) => {
    setEntry((e) => ({ ...e, ...patch }));
    setDirty(true);
    setSync({ kind: 'idle' });
  };

  const save = async () => {
    const saved: DailyReview = { ...entry, flowScore: entry.flowScore, updatedAt: new Date().toISOString() };
    setSync({ kind: 'saving' });
    try {
      await dailyRepo.save(saved);
      setEntry(saved);
      setReviews(await dailyRepo.list());
      setDirty(false);
      if (publishing.live && toNotion && target) {
        write(TARGET_KEY, target);
        const page = await syncDailyReview(publishing.apiBase, { dataSourceId: target, entry: saved });
        setSync({ kind: 'saved', url: page.url, local: false });
      } else setSync({ kind: 'saved', local: true });
    } catch (e) {
      setSync({ kind: 'error', message: e instanceof Error ? e.message : 'Could not save.' });
    }
  };

  if (!trades) return null;
  const isToday = date === todayIso();

  return (
    <>
      <div className="period-nav">
        <button className="icon-btn" aria-label="Previous trading day" onClick={() => setDate(stepDay(date, -1))}>
          <Icon name="chevronRight" className="flip-x" />
        </button>
        <h2 className="period-nav__label">{longFmt.format(new Date(`${date}T00:00:00Z`))}</h2>
        <button className="icon-btn" aria-label="Next trading day" onClick={() => setDate(stepDay(date, 1))}>
          <Icon name="chevronRight" />
        </button>
        {!isToday && (
          <button className="btn btn--sm btn--ghost" onClick={() => setDate(lastWeekday(todayIso()))}>
            Today
          </button>
        )}
      </div>

      <nav className="week-strip" aria-label="This week">
        {weekRows.map((r) => (
          <button key={r.date} className={`week-strip__day ${r.date === date ? 'is-active' : ''}`} onClick={() => setDate(r.date)}>
            <span className="week-strip__name">{shortFmt.format(new Date(`${r.date}T00:00:00Z`))}</span>
            <span className={`week-strip__r ${signTone(r.stats.netR)}`}>{r.trades.length ? fmtR(r.stats.netR) : '—'}</span>
            <span className={`week-strip__dot ${r.review && hasContent(r.review) ? 'is-logged' : ''}`} title={r.review ? 'Daily ASR logged' : 'No Daily ASR'} />
          </button>
        ))}
      </nav>

      <div className="daily-grid">
        <section className="panel daily-form">
          <header className="panel__head">
            <div>
              <h2 className="section-title">Daily ASR</h2>
              <p className="section-sub">Observations, emotions, decisions and behaviour — two minutes at the end of the day.</p>
            </div>
            {entry.source?.recordUrl && (
              <a className="link small" href={entry.source.recordUrl} target="_blank" rel="noreferrer">
                In Notion <Icon name="external" size={12} />
              </a>
            )}
          </header>
          <div className="daily-form__body">
            <div className="daily-scores">
              <ScorePicker label="Performance score" value={entry.performanceScore} onChange={(v) => update({ performanceScore: v })} hint="How well did you execute your plan — regardless of P/L?" />
              <ScorePicker
                label="Flow score"
                value={entry.flowScore}
                onChange={(v) => update({ flowScore: v })}
                hint={
                  flowAvg !== null ? (
                    <>
                      Flow Log average today: <strong>{flowAvg}</strong> ({checkins.length} check-in{checkins.length === 1 ? '' : 's'}){' '}
                      {entry.flowScore === null && (
                        <button className="link small" onClick={() => update({ flowScore: Math.round(flowAvg) })}>
                          Use
                        </button>
                      )}
                    </>
                  ) : (
                    'How in-flow did you feel overall?'
                  )
                }
              />
            </div>
            <TagPicker label="Wins" tone="gain" options={usedTags('wins')} value={entry.wins} onChange={(v) => update({ wins: v })} />
            <TagPicker label="Mistakes" tone="loss" options={usedTags('mistakes')} value={entry.mistakes} onChange={(v) => update({ mistakes: v })} />
            <TagPicker label="Emotions" tone="neutral" options={usedTags('emotions')} value={entry.emotions} onChange={(v) => update({ emotions: v })} />
            <TextField label="Observations" placeholder="What did you notice in the market — and in yourself?" value={entry.observations} onChange={(v) => update({ observations: v })} />
            <TextField label="Decisions" placeholder="Key decisions today and why (including trades you didn't take)." value={entry.decisions} onChange={(v) => update({ decisions: v })} />
            <TextField label="Lesson" placeholder="The one thing to carry into tomorrow." value={entry.lesson} onChange={(v) => update({ lesson: v })} />
          </div>
          <footer className="daily-form__foot">
            {publishing.live ? (
              <div className="daily-sync">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={toNotion}
                    onChange={(e) => {
                      setToNotion(e.target.checked);
                      write(SYNC_KEY, e.target.checked ? '1' : '0');
                    }}
                  />
                  Also save to Notion
                </label>
                {toNotion && (
                  <span className="select select--sm">
                    <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Daily ASR database">
                      <option value="">{datasets ? 'Choose database…' : 'Loading…'}</option>
                      {datasets?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevronDown" size={12} className="select__chevron" />
                  </span>
                )}
              </div>
            ) : (
              <span className="muted small">Saved in Tradelens. Connect Notion to also sync to a Daily ASR database.</span>
            )}
            <div className="daily-form__actions">
              {sync.kind === 'saved' && (
                <span className="small num-gain" role="status">
                  <Icon name="check" size={12} /> Saved{!sync.local && ' · synced to Notion'}{' '}
                  {sync.url && (
                    <a className="link" href={sync.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                </span>
              )}
              {sync.kind === 'error' && (
                <span className="small num-loss" role="alert">
                  {sync.message}
                </span>
              )}
              <button className="btn btn--primary" onClick={() => void save()} disabled={sync.kind === 'saving' || (!dirty && sync.kind !== 'error') || (toNotion && publishing.live && !target)}>
                {sync.kind === 'saving' ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  'Save Daily ASR'
                )}
              </button>
            </div>
          </footer>
        </section>

        <aside className="daily-side">
          <div className="metrics metrics--stack">
            <Stat label="Net R" value={taken.length ? fmtR(stats.netR) : '—'} tone={stats.netR > 0 ? 'positive' : stats.netR < 0 ? 'negative' : undefined} foot={`${taken.length} trade${taken.length === 1 ? '' : 's'} · ${fmtWinRate(stats.winRate)} win`} />
          </div>
          <section className="panel">
            <header className="panel__head">
              <h3 className="section-title">Trades</h3>
            </header>
            {dayTrades.length === 0 ? (
              <p className="panel__body muted">No trades logged {isToday ? 'yet today' : 'this day'}.</p>
            ) : (
              <ul className="list">
                {dayTrades.map((t) => (
                  <li key={t.id} className="list__item">
                    <div className="list__main">
                      <span className="strong">
                        {t.currency_pair} <span className="muted">· {t.setup}</span>
                      </span>
                      <span className="list__sub">
                        {isMissed(t) ? 'Missed' : [t.optional.trading_session, ...(Array.isArray(t.optional.negative_tags) ? t.optional.negative_tags : [])].filter(Boolean).join(' · ') || 'Taken'}
                      </span>
                    </div>
                    <span className={`num ${isMissed(t) ? 'muted' : signTone(t.result_r)}`}>{fmtR(t.result_r)}</span>
                  </li>
                ))}
              </ul>
            )}
            {missed.length > 0 && <p className="panel__note muted small">Missed trades are shown for context and don't count towards Net R.</p>}
          </section>
          {checkins.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <h3 className="section-title">Flow check-ins</h3>
              </header>
              <ul className="list">
                {checkins.map((c) => (
                  <li key={c.id} className="list__item">
                    <div className="list__main">
                      <span className="strong">{c.timeOfDay ?? 'Check-in'}</span>
                      <span className="list__sub">{[...c.positive, ...c.negative].join(' · ') || '—'}</span>
                    </div>
                    <span className="num">{c.score}/10</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
