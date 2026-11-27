import { useEffect, useMemo, useRef, useState } from 'react';
import { breakdown, dailyEquity, performance } from '../../domain/analytics/analytics';
import { getDimension } from '../../domain/analytics/dimensions';
import { tagSummary, type TagTone } from '../../domain/tags/tags';
import { periodRange, shiftPeriod, PERIOD_NOUN, type ReviewPeriod } from '../../domain/analytics/review';
import type { FlowEntry, FlowRepository } from '../../domain/flow/flow';
import { buildAsr, PLAN_LABEL } from '../../domain/review/asr';
import { dayRows, discipline, opportunityGaps, patterns, repeatableTags, subPanels, tradeQuality } from '../../domain/review/centre';
import { centreTarget } from '../../domain/centre/settings';
import { syncPlanItem, syncTradeRating } from '../../sources/http/reviewPublisher';
import { planKey, type DailyRepository, type DailyReview, type PlanItem, type PlanRepository } from '../../domain/review/daily';
import type { DataSourceConnector } from '../../domain/source/types';
import type { TradeRepository } from '../../domain/trades/repository';
import { isMissed } from '../../domain/trades/status';
import type { StandardTrade } from '../../domain/trades/types';
import { LineChart, type LineSeries } from '../../ui/charts/LineChart';
import { ChartExport } from '../../ui/ChartExport';
import { PageHeader } from '../../ui/PageHeader';
import { fmtDate, fmtPct, fmtR, fmtWinRate, Icon, signTone, Stat } from '../../ui/primitives';
import { BreakdownTable } from '../performance/BreakdownTable';
import { AsrDialog, type AsrChart } from './AsrDialog';
import { DailyReviewPage } from './DailyReviewPage';
import { DaySummaries, DisciplinePanel, GapsPanel, PatternsPanel, PlanPanel, RepeatableTagsPanel, ScoreTrend, SubPanels, type FocusCandidate } from './CentreSections';
import { FocusAreas } from './FocusAreas';
import { RateTrades, RatingGapsPanel } from './RatingReview';
import { activeFocusAreas, MAX_ACTIVE_FOCUS } from '../../domain/review/focus';

export interface ReviewPublishing {
  live: boolean;
  connector: DataSourceConnector;
  apiBase: string;
}

export type ReviewTab = 'day' | ReviewPeriod;

const TABS = [
  { key: 'day', label: 'Daily', href: '#/review/day' },
  { key: 'week', label: 'Weekly', href: '#/review/week' },
  { key: 'month', label: 'Monthly', href: '#/review/month' },
  { key: 'quarter', label: 'Quarterly', href: '#/review/quarter' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

function Delta({ value, unit, invert }: { value: number | null; unit: 'R' | 'pts' | 'count'; invert?: boolean }) {
  if (value === null) return <span className="delta delta--flat">No prior data</span>;
  const r = Math.round(value * 100) / 100;
  const good = invert ? r < 0 : r > 0;
  const cls = r === 0 ? 'flat' : good ? 'up' : 'down';
  const text = unit === 'R' ? fmtR(r) : unit === 'pts' ? `${r > 0 ? '+' : ''}${r} pts` : `${r > 0 ? '+' : ''}${r}`;
  return <span className={`delta delta--${cls}`}>{text} vs prior</span>;
}


function TradeList({ title, trades }: { title: string; trades: StandardTrade[] }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="section-title">{title}</h2>
      </header>
      {trades.length === 0 ? (
        <p className="panel__body muted">None this period.</p>
      ) : (
        <ul className="list">
          {trades.map((t) => (
            <li key={t.id} className="list__item">
              <div className="list__main">
                <span className="strong">
                  {t.currency_pair} <span className="muted">· {t.setup}</span>
                </span>
                <span className="list__sub">{fmtDate(t.trade_date)}</span>
              </div>
              <span className={`num ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</span>
              {t.source.recordUrl && (
                <a className="icon-btn" href={t.source.recordUrl} target="_blank" rel="noreferrer" aria-label="Open in Notion">
                  <Icon name="external" size={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TagList({ title, items, empty, tone = 'neutral' }: { title: string; items: [string, number][]; empty: string; tone?: TagTone }) {
  const max = Math.max(1, ...items.map((i) => i[1]));
  return (
    <div className={`tag-list tag-list--${tone}`}>
      <h3 className="label">{title}</h3>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul>
          {items.map(([tag, n]) => (
            <li key={tag}>
              <span className="tag-list__name">{tag}</span>
              <span className="tag-list__bar" aria-hidden="true">
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="num">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const rFormat = (v: number) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}R`);

const HEADER = {
  title: 'Review Centre',
  description: 'A single home for your review process — daily ASRs feed your weekly, monthly and quarterly reviews.',
};
const PERIOD_ADJ: Record<ReviewPeriod, string> = { week: 'weekly', month: 'monthly', quarter: 'quarterly' };
const PLAN_HINT: Record<ReviewPeriod, string> = {
  week: 'What you committed to this week. Click a status to mark it kept or missed.',
  month: 'The areas you are working on this month.',
  quarter: 'Your strategic objectives for the quarter.',
};

export function ReviewPage(props: {
  trades: TradeRepository;
  period: ReviewTab;
  flow?: FlowRepository;
  daily: DailyRepository;
  plans: PlanRepository;
  publishing: ReviewPublishing;
  date?: string;
}) {
  if (props.period === 'day') {
    return (
      <div className="page">
        <PageHeader title={HEADER.title} description={HEADER.description} tabs={TABS} activeTab="day" />
        <DailyReviewPage trades={props.trades} flow={props.flow} daily={props.daily} publishing={props.publishing} date={props.date} />
      </div>
    );
  }
  return <PeriodReview {...props} period={props.period} />;
}

function PeriodReview({
  trades: repo,
  period,
  flow: flowRepo,
  daily: dailyRepo,
  plans,
  publishing,
}: {
  trades: TradeRepository;
  period: ReviewPeriod;
  flow?: FlowRepository;
  daily: DailyRepository;
  plans: PlanRepository;
  publishing: ReviewPublishing;
}) {
  const [reviews, setReviews] = useState<DailyReview[]>([]);
  const [planVersion, setPlanVersion] = useState(0);
  const [planSync, setPlanSync] = useState<string | null>(null);
  const [rating, setRating] = useState<{ saving: Set<string>; error: string | null }>({ saving: new Set(), error: null });
  useEffect(() => void dailyRepo.list().then(setReviews), [dailyRepo]);
  const [all, setAll] = useState<StandardTrade[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowEntry[]>([]);
  const [asrOpen, setAsrOpen] = useState(false);
  const equityRef = useRef<HTMLDivElement>(null);
  const missedRef = useRef<HTMLDivElement>(null);

  useEffect(() => void flowRepo?.list().then(setFlow), [flowRepo]);

  useEffect(() => {
    void repo.list().then((list) => {
      setAll(list);
      // Start on the current period, or the latest period with trades if this one is empty.
      const today = todayIso();
      const cur = periodRange(period, today);
      const latest = list.reduce((a, t) => (t.trade_date > a ? t.trade_date : a), '');
      const hasCurrent = list.some((t) => t.trade_date >= cur.start && t.trade_date <= cur.end);
      setAnchor(hasCurrent || !latest ? today : latest);
    });
  }, [repo, period]);

  const range = anchor ? periodRange(period, anchor) : null;
  const prevRange = anchor ? periodRange(period, shiftPeriod(period, anchor, -1)) : null;
  const inRange = (t: StandardTrade, r: { start: string; end: string }) => t.trade_date >= r.start && t.trade_date <= r.end;

  const taken = useMemo(() => (all && range ? all.filter((t) => !isMissed(t) && inRange(t, range)) : []), [all, range?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevTaken = useMemo(() => (all && prevRange ? all.filter((t) => !isMissed(t) && inRange(t, prevRange)) : []), [all, prevRange?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const missed = useMemo(() => (all && range ? all.filter((t) => isMissed(t) && inRange(t, range)) : []), [all, range?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const perf = useMemo(() => performance(taken), [taken]);
  const prev = useMemo(() => performance(prevTaken), [prevTaken]);
  const setups = useMemo(() => breakdown(taken, getDimension('setup')), [taken]);
  const tagSections = useMemo(() => tagSummary(taken, missed), [taken, missed]);
  const missedSeries = useMemo((): LineSeries[] => {
    const realPts = dailyEquity(taken).map((p) => ({ date: p.date, value: p.r }));
    const potentialPts = dailyEquity([...taken, ...missed]).map((p) => ({ date: p.date, value: p.r }));
    return [
      { key: 'real', label: 'Real (taken)', color: 'var(--chart-1)', points: realPts },
      { key: 'potential', label: 'With missed trades', color: 'var(--chart-3)', points: potentialPts },
    ];
  }, [taken, missed]);

  const today = todayIso();
  const rows = useMemo(() => (range ? dayRows(range, taken, reviews, flow) : []), [range?.start, taken, reviews, flow]); // eslint-disable-line react-hooks/exhaustive-deps
  const panels = useMemo(
    () => (range && period !== 'week' ? subPanels(period, range, all?.filter((t) => !isMissed(t)) ?? [], reviews, flow, today) : []),
    [range?.start, all, reviews, flow, period], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!all || !range || !anchor) return null;
  const disc = discipline(rows, today);
  const quality = tradeQuality(taken);
  const key = planKey(period, range.start);
  const nextKey = planKey(period, periodRange(period, shiftPeriod(period, anchor, 1)).start);
  void planVersion;
  const planItems = plans.get(key);
  const focusEntries = activeFocusAreas(plans.entries());
  const focusedSources = new Set(plans.entries().filter((e) => e.item.source).map((e) => e.item.source!));
  const allTaken = all.filter((t) => !isMissed(t));
  const addFocus = (c: FocusCandidate) => {
    if (focusEntries.length >= MAX_ACTIVE_FOCUS && !window.confirm(`You already have ${focusEntries.length} active focus areas. We suggest no more than ${MAX_ACTIVE_FOCUS} at a time — add another anyway?`)) return;
    const monthKey = planKey('month', periodRange('month', today).start);
    const item: PlanItem = { id: `p${Date.now().toString(36)}`, text: c.label, status: 'open', source: c.source, goal: c.goal, start: today };
    setPlan(monthKey)([...plans.get(monthKey), item]);
  };
  const closeFocus = (k: string, item: PlanItem, status: PlanItem['status']) => setPlan(k)(plans.get(k).map((x) => (x.id === item.id ? { ...x, status } : x)));

  /** Save a review rating locally, then on the trade's Notion page. */
  const rateTrade = async (t: StandardTrade, value: number | null) => {
    const updated: StandardTrade = { ...t, optional: { ...t.optional, review_rating: value } };
    setAll((prev) => (prev ? prev.map((x) => (x.id === t.id ? updated : x)) : prev));
    await repo.upsertMany([updated]);
    if (!publishing.live || t.source.kind !== 'notion') return;
    setRating((r) => ({ saving: new Set(r.saving).add(t.id), error: null }));
    try {
      await syncTradeRating(publishing.apiBase, { dataSourceId: t.source.datasetId, pageId: t.source.recordId, value });
      setRating((r) => {
        const saving = new Set(r.saving);
        saving.delete(t.id);
        return { saving, error: null };
      });
    } catch (e) {
      setRating((r) => {
        const saving = new Set(r.saving);
        saving.delete(t.id);
        return { saving, error: `Saved in Tradelens, but not in Notion: ${e instanceof Error ? e.message : 'unknown error'}` };
      });
    }
  };
  const nextItems = plans.get(nextKey);
  const setPlan = (k: string) => (items: PlanItem[]) => {
    const before = plans.get(k);
    plans.set(k, items);
    setPlanVersion((v) => v + 1);
    void pushPlans(k, before, items);
  };

  /** Mirror plan edits to the Trading Centre's Plans database. Failures leave the local copy intact. */
  const pushPlans = async (k: string, before: PlanItem[], after: PlanItem[]) => {
    const dataSourceId = centreTarget('plans');
    if (!publishing.live || !dataSourceId) return;
    const keyPeriod = k.slice(0, k.indexOf(':')) as ReviewPeriod;
    const start = k.slice(k.indexOf(':') + 1);
    const { end } = periodRange(keyPeriod, start);
    const changed = after.filter((i) => {
      const old = before.find((b) => b.id === i.id);
      return !old || old.text !== i.text || old.status !== i.status || !i.notion;
    });
    const removed = before.filter((b) => b.notion && !after.some((a) => a.id === b.id));
    try {
      let next = after;
      for (const item of changed) {
        const page = await syncPlanItem(publishing.apiBase, { dataSourceId, item, period: keyPeriod, start: item.start ?? start, end });
        if (page.id && !item.notion) next = next.map((x) => (x.id === item.id ? { ...x, notion: { pageId: page.id, url: page.url } } : x));
      }
      for (const item of removed) await syncPlanItem(publishing.apiBase, { dataSourceId, item, period: keyPeriod, start, end, archive: true });
      if (next !== after) {
        // Keep any edits made while the sync was in flight; only attach the new page ids.
        plans.set(k, plans.get(k).map((x) => next.find((n) => n.id === x.id && n.notion && !x.notion) ?? x));
        setPlanVersion((v) => v + 1);
      }
      setPlanSync(null);
    } catch (e) {
      setPlanSync(e instanceof Error ? e.message : 'Could not sync to Notion.');
    }
  };
  const hasPrev = prevTaken.length > 0;
  const sorted = [...taken].sort((a, b) => b.result_r - a.result_r);
  const best = sorted.filter((t) => t.result_r > 0).slice(0, 3);
  const worst = [...sorted].reverse().filter((t) => t.result_r < 0).slice(0, 3);
  const missedR = missed.filter((t) => t.result_r > 0).reduce((a, t) => a + t.result_r, 0);
  const noun = PERIOD_NOUN[period];
  const isCurrent = range.start <= todayIso() && todayIso() <= range.end;
  const potentialNet = missedSeries[1].points.at(-1)?.value ?? 0;
  const asrCharts: AsrChart[] = [
    ...(taken.length ? [{ key: 'equity', label: 'Equity curve', ref: equityRef, title: `Equity · ${range.label}`, subtitle: `Cumulative R · ${fmtR(perf.netR)}` }] : []),
    ...(missed.length
      ? [{ key: 'missed', label: 'Real vs missed equity', ref: missedRef, title: `Real vs missed equity · ${range.label}`, subtitle: `Real ${fmtR(perf.netR)} · with missed trades ${fmtR(potentialNet)}` }]
      : []),
  ];

  return (
    <div className="page">
      <PageHeader title={HEADER.title} description={HEADER.description} tabs={TABS} activeTab={period} />

      <div className="period-nav">
        <button className="icon-btn" aria-label={`Previous ${noun}`} onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}>
          <Icon name="chevronRight" className="flip-x" />
        </button>
        <h2 className="period-nav__label">{range.label}</h2>
        <button className="icon-btn" aria-label={`Next ${noun}`} onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}>
          <Icon name="chevronRight" />
        </button>
        {!isCurrent && (
          <button className="btn btn--sm btn--ghost" onClick={() => setAnchor(todayIso())}>
            This {noun}
          </button>
        )}
        {(taken.length > 0 || missed.length > 0) && (
          <div className="period-nav__actions">
            <button className="btn btn--sm btn--primary" onClick={() => setAsrOpen(true)}>
              <Icon name="send" size={14} /> Create {PERIOD_ADJ[period]} ASR
            </button>
          </div>
        )}
      </div>

      <AsrDialog
        open={asrOpen}
        onClose={() => setAsrOpen(false)}
        live={publishing.live}
        connector={publishing.connector}
        apiBase={publishing.apiBase}
        periodLabel={range.label}
        charts={asrCharts}
        build={(images) => buildAsr({ period, range, taken, prevTaken, missed, flow, images, daily: reviews, plan: planItems, nextPlan: nextItems, today })}
      />

      {(focusEntries.length > 0 || period === 'month') && <FocusAreas entries={focusEntries} trades={allTaken} today={today} onClose={closeFocus} />}

      {taken.length === 0 && missed.length === 0 ? (
        <div className="empty-state panel">
          <h2 className="section-title">No trades this {noun}</h2>
          <p className="muted">Use the arrows to step to a {noun} with trades.</p>
        </div>
      ) : (
        <>
          <div className="metrics metrics--6">
            <Stat label="Net R" value={fmtR(perf.netR)} tone={perf.netR > 0 ? 'positive' : perf.netR < 0 ? 'negative' : undefined} foot={<Delta value={hasPrev ? perf.netR - prev.netR : null} unit="R" />} />
            <Stat
              label="Win rate"
              value={fmtWinRate(perf.winRate)}
              foot={<Delta value={hasPrev && perf.winRate !== null && prev.winRate !== null ? Math.round((perf.winRate - prev.winRate) * 100) : null} unit="pts" />}
            />
            <Stat label="Trades" value={perf.count} foot={<Delta value={hasPrev ? perf.count - prev.count : null} unit="count" />} />
            <Stat label="Profit factor" value={perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)} foot={`Prior: ${prev.profitFactor === null ? '—' : prev.profitFactor.toFixed(2)}`} />
            <Stat label="Net P/L" value={fmtPct(perf.netPl)} tone={perf.netPl > 0 ? 'positive' : perf.netPl < 0 ? 'negative' : undefined} foot={`Expectancy ${fmtR(perf.avgR)}`} />
            <Stat label="Max drawdown" value={perf.maxDrawdownR ? `\u2212${perf.maxDrawdownR.toFixed(2)}R` : '0R'} tone={perf.maxDrawdownR ? 'negative' : undefined} foot={`Streaks ${perf.longestWinStreak}W / ${perf.longestLossStreak}L`} />
          </div>

          {period === 'week' && <DaySummaries rows={rows} today={today} />}
          {period === 'month' && <SubPanels title="Weeks" panels={panels} />}
          {period === 'quarter' && <SubPanels title="Months" panels={panels} />}

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">Equity this {noun}</h2>
              <ChartExport target={equityRef} title={`Equity · ${range.label}`} subtitle={`Cumulative R · ${fmtR(perf.netR)}`} />
              <span className="panel__aside muted">{perf.tradingDays} trading days</span>
            </header>
            <div className="panel__body" ref={equityRef}>
              <LineChart
                height={220}
                series={[{ key: 'r', label: 'Cumulative R', color: 'var(--chart-1)', points: dailyEquity(taken).map((p) => ({ date: p.date, value: p.r })) }]}
                format={rFormat}
                ariaLabel={`Cumulative R for ${range.label}: ${fmtR(perf.netR)}`}
              />
            </div>
          </section>

          {missed.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <h2 className="section-title">Real vs missed equity</h2>
                <ChartExport target={missedRef} title={`Real vs missed equity · ${range.label}`} subtitle={`Real ${fmtR(perf.netR)} · with missed trades ${fmtR(potentialNet)}`} />
              </header>
              <div className="panel__body" ref={missedRef}>
                <LineChart
                  height={220}
                  series={missedSeries}
                  format={rFormat}
                  ariaLabel={`Real equity ${fmtR(perf.netR)} versus equity including missed trades ${fmtR(potentialNet)} for ${range.label}`}
                />
              </div>
            </section>
          )}

          <DisciplinePanel d={disc} q={quality} />
          {period === 'week' && <RateTrades trades={[...taken].sort((a, b) => a.trade_date.localeCompare(b.trade_date))} onRate={(t, v) => void rateTrade(t, v)} saving={rating.saving} error={rating.error} />}
          <RatingGapsPanel trades={taken} />
          {period !== 'week' && <ScoreTrend rows={rows} />}
          {period === 'quarter' && <PatternsPanel {...patterns(taken)} />}
          {period !== 'week' && <RepeatableTagsPanel tags={repeatableTags(taken, rows)} />}
          {period === 'month' && <GapsPanel g={opportunityGaps(taken, missed, rows, today)} onFocus={addFocus} focused={focusedSources} />}

          <div className="grid-2">
            <TradeList title="Best trades" trades={best} />
            <TradeList title="Worst trades" trades={worst} />
          </div>

          {setups.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <h2 className="section-title">Setups this {noun}</h2>
              </header>
              <BreakdownTable rows={setups} label="Setup" />
            </section>
          )}

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2 className="section-title">Behaviour & tags</h2>
                <p className="section-sub">Mistakes include missed trades, so each one shows its full cost.</p>
              </div>
            </header>
            {tagSections.length === 0 ? (
              <p className="panel__body muted">No tags this {noun}. Add Behaviour, Technical or Psychology tags to your trades in Notion to see patterns here.</p>
            ) : (
              <div className="tag-lists">
                {tagSections.map((sec) => (
                  <TagList key={sec.title} title={sec.title} tone={sec.tone} items={sec.items} empty="" />
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel__head">
              <h2 className="section-title">Missed this {noun}</h2>
              {missed.length > 0 && <a className="link small" href="#/missed">All missed trades</a>}
            </header>
            {missed.length === 0 ? (
              <p className="panel__body muted">No missed trades logged.</p>
            ) : (
              <div className="panel__body review-missed">
                <p>
                  <strong>{missed.length}</strong> missed trade{missed.length === 1 ? '' : 's'} — <span className="num-gain">{fmtR(missedR)}</span> left on the table from would-be winners.
                </p>
                <ul className="chips">
                  {missed.map((t) => (
                    <li key={t.id} className="chip">
                      {t.currency_pair} · {fmtR(t.result_r)}
                      {typeof t.optional.missed_reason === 'string' && <span className="muted"> · {t.optional.missed_reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      <PlanPanel
        title={`${PLAN_LABEL[period]} this ${noun}`}
        hint={PLAN_HINT[period]}
        items={planItems}
        onChange={setPlan(key)}
        nextTitle={`${PLAN_LABEL[period]} for next ${noun}`}
        nextItems={nextItems}
        onNextChange={setPlan(nextKey)}
        syncNote={planSync ? <span className="num-loss">Notion sync failed: {planSync}</span> : centreTarget('plans') && publishing.live ? 'Synced to Plans in your Trading Centre.' : undefined}
      />
    </div>
  );
}
