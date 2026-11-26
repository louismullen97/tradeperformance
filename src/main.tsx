import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { ModeBanner } from './app/ModeBanner';
import { TRADE_FIELDS } from './domain/fields/registry';
import { InMemoryTradeRepository } from './domain/import/importService';
import { LocalStorageMappingRepository } from './domain/mapping/repository';
import type { DataSourceConnector } from './domain/source/types';
import { ImportWizard } from './features/import-wizard/ImportWizard';
import type { ImportServices } from './features/import-wizard/useImportWizard';
import { HttpConnector, type ConnectionStatus } from './sources/http/httpConnector';
import { MockNotionConnector } from './sources/notion/mockConnector';
import './styles/tokens.css';
import './styles/app.css';

const NOTION_API = '/api/notion';

/**
 * Composition root. Uses the live Notion backend when the server has a token,
 * otherwise demo data. `?demo` forces demo data.
 */
async function resolveConnector(): Promise<{ connector: DataSourceConnector; status: ConnectionStatus; demo: boolean }> {
  if (new URLSearchParams(location.search).has('demo')) {
    return { connector: new MockNotionConnector(), status: { mode: 'unconfigured' }, demo: true };
  }
  let status: ConnectionStatus;
  try {
    status = await HttpConnector.status(NOTION_API);
  } catch {
    status = { mode: 'error', error: { code: 'unreachable', message: 'The Tradelens backend is not reachable.' } };
  }
  return status.mode === 'live'
    ? { connector: new HttpConnector('notion', 'Notion', NOTION_API), status, demo: false }
    : { connector: new MockNotionConnector(), status, demo: true };
}

async function main() {
  const { connector, status, demo } = await resolveConnector();
  const services: ImportServices = {
    connector,
    mappings: new LocalStorageMappingRepository(),
    trades: new InMemoryTradeRepository(),
    fields: TRADE_FIELDS,
  };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppShell
        connection={{
          live: !demo,
          title: demo ? 'Notion · Demo workspace' : `Notion · ${status.workspace ?? 'Connected'}`,
          subtitle: demo ? 'Demo data' : 'Live · read-only',
        }}
      >
        {demo && <ModeBanner status={status} />}
        <ImportWizard services={services} />
      </AppShell>
    </StrictMode>,
  );
}

void main();
