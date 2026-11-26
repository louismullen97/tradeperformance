import { useEffect, useState } from 'react';
import { JournalPage } from '../features/journal/JournalPage';
import { ImportWizard } from '../features/import-wizard/ImportWizard';
import type { ImportServices } from '../features/import-wizard/useImportWizard';
import type { ConnectionStatus } from '../sources/http/httpConnector';
import { AppShell, type View } from './AppShell';
import { ModeBanner } from './ModeBanner';

function viewFromHash(fallback: View): View {
  const h = location.hash.replace(/^#\/?/, '');
  return h === 'journal' || h === 'imports' ? h : fallback;
}

export function App({
  services,
  status,
  demo,
  hasTrades,
}: {
  services: ImportServices;
  status: ConnectionStatus;
  demo: boolean;
  hasTrades: boolean;
}) {
  const fallback: View = hasTrades ? 'journal' : 'imports';
  const [view, setView] = useState<View>(() => viewFromHash(fallback));

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash(fallback));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fallback]);

  return (
    <AppShell
      view={view}
      connection={{
        live: !demo,
        title: demo ? 'Notion · Demo workspace' : `Notion · ${status.workspace ?? 'Connected'}`,
        subtitle: demo ? 'Demo data' : 'Live · read-only',
      }}
    >
      {view === 'imports' && demo && <ModeBanner status={status} />}
      {view === 'journal' ? <JournalPage trades={services.trades} /> : <ImportWizard services={services} />}
    </AppShell>
  );
}
