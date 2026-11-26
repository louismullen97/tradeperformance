import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { TRADE_FIELDS } from './domain/fields/registry';
import { InMemoryTradeRepository } from './domain/import/importService';
import { LocalStorageMappingRepository } from './domain/mapping/repository';
import { ImportWizard } from './features/import-wizard/ImportWizard';
import type { ImportServices } from './features/import-wizard/useImportWizard';
import { MockNotionConnector } from './sources/notion/mockConnector';
import './styles/tokens.css';
import './styles/app.css';

// Composition root: swap MockNotionConnector for a real connector (or a CSV
// connector) here — nothing else in the app needs to change.
const services: ImportServices = {
  connector: new MockNotionConnector(),
  mappings: new LocalStorageMappingRepository(),
  trades: new InMemoryTradeRepository(),
  fields: TRADE_FIELDS,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell connectionLabel="Notion · Demo workspace">
      <ImportWizard services={services} />
    </AppShell>
  </StrictMode>,
);
