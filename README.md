# Tradelens — Notion database mapping (stage 1)

Mapping wizard that turns a user's Notion trade journal into standardised trades.
Reads a live Notion workspace when a token is configured; otherwise shows demo data.

```bash
npm install
npm run dev        # http://localhost:5173  (add ?demo to force demo data)
npm test           # engine + Notion client tests (vitest)
npm run build      # typecheck + production build
```

## Connecting Notion

1. Create a connection at https://app.notion.com/developers/connections → **New connection** →
   authentication method **API token**. On **Configuration**, enable only **Read content** and copy
   the token (starts with `ntn_`).
2. On **Content access**, add your trade journal database(s) — or in Notion: ••• → Connections.
3. `cp .env.example .env.local` and set `NOTION_TOKEN=ntn_...`, then restart `npm run dev`.

The token is read by the server only (`/api/notion/*`, mounted in the Vite dev/preview server) and
never reaches the browser. Uses Notion API version `2026-03-11` (data sources, `in_trash`), paces
requests for the ~3 req/s limit, honours `Retry-After`, and reads past the 10,000-row query cap.
OAuth (a "Connect Notion" button for other users) is the next step; it plugs in behind the same
`/api/notion` routes.

> Behind an HTTPS proxy, run Node with `NODE_USE_ENV_PROXY=1` — Node's built-in fetch ignores `HTTPS_PROXY`.

## Architecture

```
src/
  domain/                 Pure TypeScript — no React, no Notion
    source/               SourceProperty / SourceValue / SourceRecord, DataSourceConnector interface
    fields/registry.ts    Standardised fields (6 mandatory + 10 optional)
    mapping/              compatibility matrix, name matcher, suggest, evaluate, reconcile, repository
    validation/           value coercion + record validation → valid / attention / excluded
    trades/               StandardTrade with provenance back to the source record
    import/               import batch builder + TradeRepository interface
  sources/notion/         Notion API shapes (2026-03-11) + translator to domain types
    mockConnector.ts      Demo DataSourceConnector over fixtures in raw API shape
  sources/http/           HttpConnector — browser-side connector that calls our backend
server/notion/            Server-only (holds the token)
    client.ts             REST client: pacing, retries, pagination, created_time windows
    apiConnector.ts       Live DataSourceConnector (search → data sources, query → rows)
    handler.ts            /api/notion/* routes (plain Node req/res)
  features/import-wizard/ React UI: select → map → validate → done
  ui/primitives.tsx       Icons, badges, stats, formatters
  app/AppShell.tsx        Dark sidebar + top bar
  main.tsx                Composition root (connector, repositories, field registry)
```

Data flow: `Connector → SourceSchema/Records → MappingConfig → validateRecords → ValidationReport → buildImportBatch → StandardTrade[]`

### Key decisions
- **Mappings reference property IDs** (with a name snapshot). `reconcileMapping` re-applies a saved
  config after refresh: follows renames by id, re-links by name, reports removed properties as
  `stale`, and suggests mappings for fields added to the registry since the config was saved.
- **Compatibility** is `native | convertible | incompatible`. Only native, high-confidence matches
  are "auto-matched"; convertible matches are always "review". Incompatible types can't be selected.
- **A property may feed several fields only if they share a value kind** (e.g. one Date for
  `trade_date` and `date_closed`); otherwise it's a blocking conflict.
- **Notion percent-formatted numbers** are stored as fractions; they're rescaled ×100 for `percent` fields.
- **Nothing is discarded silently.** Mandatory problems → `excluded` (with reasons, visible in the
  report). Duplicates, ambiguous dates, unusual values and R vs % sign mismatches → `attention`; the user
  decides per record (duplicates default to excluded).

### Adding a field
Add an entry to `TRADE_FIELDS` in `domain/fields/registry.ts` (key, value kind, aliases, optional
vocabulary/plausible range). Matching, the wizard, validation and saved-config reconciliation pick it up.

### Adding a source (e.g. CSV)
Implement `DataSourceConnector` (`listDatasets`, `getSchema`, `fetchRecords`) producing domain types,
then pass it into `ImportServices` in `main.tsx`.
