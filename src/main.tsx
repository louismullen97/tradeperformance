import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { LocalStorageFlowRepository } from './domain/flow/flow';
import { createFlowTarget, createTradeTarget } from './domain/import/targets';
import { LocalStorageTradeRepository } from './domain/trades/repository';
import { LocalStorageMappingRepository } from './domain/mapping/repository';
import type { DataSourceConnector } from './domain/source/types';
import type { ImportServices } from './features/import-wizard/useImportWizard';
import { HttpConnector, type ConnectionStatus } from './sources/http/httpConnector';
import { MockNotionConnector } from './sources/notion/mockConnector';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/features.css';

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
  const trades = new LocalStorageTradeRepository();
  const flow = new LocalStorageFlowRepository();
  const services: ImportServices = {
    connector,
    mappings: new LocalStorageMappingRepository(),
    targets: [createTradeTarget(trades), createFlowTarget(flow)],
  };

  const hasTrades = (await trades.count()) > 0;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App services={services} trades={trades} flow={flow} status={status} demo={demo} hasTrades={hasTrades} />
    </StrictMode>,
  );
}

void main();
