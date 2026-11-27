import { useEffect, useState } from 'react';
import { LocalStorageGoalRepository } from '../domain/goals/goals';
import { ImportWizard } from '../features/import-wizard/ImportWizard';
import type { ImportServices } from '../features/import-wizard/useImportWizard';
import { JournalPage } from '../features/journal/JournalPage';
import { MissedTradesPage } from '../features/missed/MissedTradesPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { DimensionPerformance } from '../features/performance/DimensionPerformance';
import { PerformanceOverview } from '../features/performance/PerformanceOverview';
import { PsychologyPage } from '../features/psychology/PsychologyPage';
import { ReviewPage, type ReviewTab } from '../features/review/ReviewPage';
import type { DailyRepository, PlanRepository } from '../domain/review/daily';
import type { PerformanceSub } from '../features/performance/PerformanceTabs';
import type { ConnectionStatus } from '../sources/http/httpConnector';
import type { FlowRepository } from '../domain/flow/flow';
import type { TradeRepository } from '../domain/trades/repository';
import { FlowZonePage } from '../features/psychology/FlowZonePage';
import { TagsPerformance } from '../features/performance/TagsPerformance';
import { EdgePage } from '../features/performance/EdgePage';
import { AppShell, type View } from './AppShell';
import { ModeBanner } from './ModeBanner';

interface Route {
  view: View;
  sub: PerformanceSub;
  period: ReviewTab;
  /** Daily review date (#/review/day/2026-11-24). */
  date?: string;
  psych: 'overview' | 'flow';
}

const VIEWS: View[] = ['overview', 'journal', 'performance', 'review', 'psychology', 'missed', 'imports'];

function routeFromHash(fallback: View): Route {
  const [head, sub, extra] = location.hash.replace(/^#\/?/, '').split('/');
  const view = (head === 'analysis' ? 'performance' : VIEWS.find((v) => v === head)) ?? fallback;
  return {
    view,
    sub: sub === 'setup' || sub === 'timeframe' || sub === 'tags' || sub === 'edge' ? sub : 'overview',
    psych: sub === 'flow' ? 'flow' : 'overview',
    period: sub === 'day' || sub === 'week' || sub === 'quarter' ? sub : 'month',
    date: sub === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(extra ?? '') ? extra : undefined,
  };
}

const SUB_LABEL: Record<string, string> = { setup: 'Setup', timeframe: 'Timeframe', tags: 'Tags', edge: 'Edge', flow: 'Flow Zone', day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly' };

const goals = new LocalStorageGoalRepository();

export function App({
  services,
  trades,
  flow,
  daily,
  plans,
  status,
  demo,
  hasTrades,
}: {
  services: ImportServices;
  trades: TradeRepository;
  flow: FlowRepository;
  daily: DailyRepository;
  plans: PlanRepository;
  status: ConnectionStatus;
  demo: boolean;
  hasTrades: boolean;
}) {
  const fallback: View = hasTrades ? 'overview' : 'imports';
  const [route, setRoute] = useState<Route>(() => routeFromHash(fallback));

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash(fallback));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fallback]);

  const { view, sub, period, psych, date } = route;
  const crumb =
    view === 'performance' && sub !== 'overview' ? SUB_LABEL[sub] : view === 'review' ? SUB_LABEL[period] : view === 'psychology' && psych === 'flow' ? SUB_LABEL.flow : undefined;
  return (
    <AppShell
      view={view}
      sub={crumb}
      connection={{
        live: !demo,
        title: demo ? 'Notion · Demo workspace' : `Notion · ${status.workspace ?? 'Connected'}`,
        subtitle: demo ? 'Demo data' : 'Live',
      }}
    >
      {view === 'imports' && demo && <ModeBanner status={status} />}
      {view === 'overview' && <OverviewPage trades={trades} goals={goals} />}
      {view === 'journal' && <JournalPage trades={trades} />}
      {view === 'performance' && sub === 'overview' && <PerformanceOverview trades={trades} />}
      {view === 'performance' && (sub === 'setup' || sub === 'timeframe') && <DimensionPerformance key={sub} trades={trades} sub={sub} />}
      {view === 'performance' && sub === 'tags' && <TagsPerformance trades={trades} />}
      {view === 'performance' && sub === 'edge' && <EdgePage trades={trades} />}
      {view === 'review' && (
        <ReviewPage key={period} trades={trades} period={period} date={date} flow={flow} daily={daily} plans={plans} publishing={{ live: !demo, connector: services.connector, apiBase: '/api/notion' }} />
      )}
      {view === 'psychology' && psych === 'overview' && <PsychologyPage trades={trades} />}
      {view === 'psychology' && psych === 'flow' && <FlowZonePage trades={trades} flow={flow} />}
      {view === 'missed' && <MissedTradesPage trades={trades} />}
      {view === 'imports' && <ImportWizard services={services} />}
    </AppShell>
  );
}
