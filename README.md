# Tradelens — Notion database mapping (stage 1)

Mapping wizard that turns a user's Notion trade journal into standardised trades.
Uses **mock Notion data** — no OAuth or API calls yet.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (vitest)
npm run build      # typecheck + production build
```

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
  sources/notion/         The only code that knows Notion's API shape
    types.ts              Subset of Notion API response types
    translate.ts          Notion → domain types (formula result types inferred from samples)
    mockConnector.ts      DataSourceConnector over fixtures; swap for the real client later
    mock/                 3 deterministic databases in raw Notion API shape
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
