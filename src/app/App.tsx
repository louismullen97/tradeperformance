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
import { ReviewPage } from '../features/review/ReviewPage';
import type { ReviewPeriod } from '../domain/analytics/review';
import type { PerformanceSub } from '../features/performance/PerformanceTabs';
import type { ConnectionStatus } from '../sources/http/httpConnector';
import { AppShell, type View } from './AppShell';
import { ModeBanner } from './ModeBanner';

interface Route {
  view: View;
  sub: PerformanceSub;
  period: ReviewPeriod;
}

const VIEWS: View[] = ['overview', 'journal', 'performance', 'review', 'psychology', 'missed', 'imports'];

function routeFromHash(fallback: View): Route {
  const [head, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const view = (head === 'analysis' ? 'performance' : VIEWS.find((v) => v === head)) ?? fallback;
  return {
    view,
    sub: sub === 'setup' || sub === 'timeframe' ? sub : 'overview',
    period: sub === 'week' || sub === 'quarter' ? sub : 'month',
  };
}

const SUB_LABEL: Record<string, string> = { setup: 'Setup', timeframe: 'Timeframe', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly' };

const goals = new LocalStorageGoalRepository();

export function App({ services, status, demo, hasTrades }: { services: ImportServices; status: ConnectionStatus; demo: boolean; hasTrades: boolean }) {
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

  const { view, sub, period } = route;
  const crumb = view === 'performance' && sub !== 'overview' ? SUB_LABEL[sub] : view === 'review' ? SUB_LABEL[period] : undefined;
  return (
    <AppShell
      view={view}
      sub={crumb}
      connection={{
        live: !demo,
        title: demo ? 'Notion · Demo workspace' : `Notion · ${status.workspace ?? 'Connected'}`,
        subtitle: demo ? 'Demo data' : 'Live · read-only',
      }}
    >
      {view === 'imports' && demo && <ModeBanner status={status} />}
      {view === 'overview' && <OverviewPage trades={services.trades} goals={goals} />}
      {view === 'journal' && <JournalPage trades={services.trades} />}
      {view === 'performance' && (sub === 'overview' ? <PerformanceOverview trades={services.trades} /> : <DimensionPerformance key={sub} trades={services.trades} sub={sub} />)}
      {view === 'review' && <ReviewPage key={period} trades={services.trades} period={period} />}
      {view === 'psychology' && <PsychologyPage trades={services.trades} />}
      {view === 'missed' && <MissedTradesPage trades={services.trades} />}
      {view === 'imports' && <ImportWizard services={services} />}
    </AppShell>
  );
}
