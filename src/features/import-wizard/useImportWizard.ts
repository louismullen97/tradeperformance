import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldDefinition } from '../../domain/fields/types';
import {
  buildImportBatch,
  canInclude,
  defaultDecision,
  type ImportBatch,
  type RecordDecision,
  type TradeRepository,
} from '../../domain/import/importService';
import { confirmFieldMapping, createSuggestedConfig, setFieldMapping } from '../../domain/mapping/config';
import { evaluateMapping } from '../../domain/mapping/evaluate';
import { reconcileMapping, type ReconcileChange } from '../../domain/mapping/reconcile';
import type { MappingConfigRepository } from '../../domain/mapping/repository';
import type { MappingConfig } from '../../domain/mapping/types';
import type { DataSourceConnector, SourceDataset, SourceRecord, SourceSchema } from '../../domain/source/types';
import { validateRecords } from '../../domain/validation/validate';

export interface ImportServices {
  connector: DataSourceConnector;
  mappings: MappingConfigRepository;
  trades: TradeRepository;
  fields: readonly FieldDefinition[];
}

export type WizardStep = 'select' | 'map' | 'validate' | 'done';

export function useImportWizard(services: ImportServices) {
  const { connector, mappings, trades, fields } = services;

  const [step, setStep] = useState<WizardStep>('select');
  const [datasets, setDatasets] = useState<SourceDataset[] | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SourceSchema | null>(null);
  const [records, setRecords] = useState<SourceRecord[] | null>(null);
  const [config, setConfig] = useState<MappingConfig | null>(null);
  const [restored, setRestored] = useState<{ changes: ReconcileChange[]; schemaChanged: boolean } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RecordDecision>>({});
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [busy, setBusy] = useState<null | 'datasets' | 'loading' | 'importing'>(null);
  const [error, setError] = useState<string | null>(null);

  // Some providers (Notion) can't count rows in the listing call; fill counts in
  // one at a time so the list renders immediately and the API isn't flooded.
  const loadMissingCounts = useCallback(
    async (list: SourceDataset[]) => {
      if (!connector.countRecords) return;
      for (const d of list) {
        if (d.recordCount !== null) continue;
        try {
          const n = await connector.countRecords(d.id);
          setDatasets((cur) => cur?.map((x) => (x.id === d.id ? { ...x, recordCount: n } : x)) ?? cur);
        } catch {
          /* leave the count unknown; the import itself still works */
        }
      }
    },
    [connector],
  );

  const loadDatasets = useCallback(async () => {
    setBusy('datasets');
    setError(null);
    try {
      const [list, ids] = await Promise.all([connector.listDatasets(), mappings.listDatasetIds(connector.kind)]);
      setDatasets(list);
      setSavedIds(new Set(ids));
      void loadMissingCounts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load databases.');
    } finally {
      setBusy(null);
    }
  }, [connector, mappings, loadMissingCounts]);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  const dataset = useMemo(() => datasets?.find((d) => d.id === selectedId) ?? null, [datasets, selectedId]);

  /** Load schema + records for the selected dataset and build or restore its mapping. */
  const startMapping = useCallback(async () => {
    if (!dataset) return;
    setBusy('loading');
    setError(null);
    try {
      const [nextSchema, nextRecords, saved] = await Promise.all([
        connector.getSchema(dataset.id),
        connector.fetchRecords(dataset.id),
        mappings.find(dataset.kind, dataset.id),
      ]);
      setSchema(nextSchema);
      setRecords(nextRecords);
      setDatasets((cur) => cur?.map((x) => (x.id === dataset.id ? { ...x, recordCount: nextRecords.length } : x)) ?? cur);
      if (saved) {
        const result = reconcileMapping(saved, nextSchema, fields);
        setConfig(result.config);
        setRestored({ changes: result.changes, schemaChanged: result.schemaChanged });
      } else {
        setConfig(createSuggestedConfig(dataset, nextSchema, fields));
        setRestored(null);
      }
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the database.');
    } finally {
      setBusy(null);
    }
  }, [connector, dataset, fields, mappings]);

  const evaluation = useMemo(
    () => (config && schema ? evaluateMapping(config, schema.properties, fields) : null),
    [config, schema, fields],
  );

  const setMapping = useCallback(
    (fieldKey: string, propertyId: string | null) => {
      if (!schema) return;
      const property = propertyId ? schema.properties.find((p) => p.id === propertyId) ?? null : null;
      setConfig((c) => (c ? setFieldMapping(c, fieldKey, property) : c));
    },
    [schema],
  );

  const confirmMapping = useCallback((fieldKey: string) => {
    setConfig((c) => (c ? confirmFieldMapping(c, fieldKey) : c));
  }, []);

  const resetToSuggestions = useCallback(() => {
    if (!dataset || !schema || !config) return;
    const fresh = createSuggestedConfig(dataset, schema, fields);
    setConfig({ ...fresh, id: config.id, createdAt: config.createdAt });
    setRestored(null);
  }, [config, dataset, fields, schema]);

  // Validation is re-derived from the mapping, so going back and changing a
  // mapping always yields a fresh report.
  const report = useMemo(
    () =>
      step === 'validate' || step === 'done'
        ? config && schema && records
          ? validateRecords(records, schema.properties, config, fields)
          : null
        : null,
    [step, config, schema, records, fields],
  );

  const goToValidation = useCallback(async () => {
    if (!config || !schema || !records || !evaluation?.canProceed) return;
    const next = validateRecords(records, schema.properties, config, fields);
    setDecisions(Object.fromEntries(next.records.map((r) => [r.record.id, defaultDecision(r)])));
    await mappings.save(config); // persist so a refresh/reconnect can reuse it
    setSavedIds((s) => new Set(s).add(config.source.datasetId));
    setStep('validate');
  }, [config, evaluation, fields, mappings, records, schema]);

  const setDecision = useCallback((recordId: string, decision: RecordDecision) => {
    setDecisions((d) => ({ ...d, [recordId]: decision }));
  }, []);

  const setDecisionForMany = useCallback((recordIds: string[], decision: RecordDecision) => {
    setDecisions((d) => {
      const next = { ...d };
      for (const id of recordIds) next[id] = decision;
      return next;
    });
  }, []);

  const includedCount = useMemo(
    () => report?.records.filter((r) => canInclude(r) && decisions[r.record.id] === 'include').length ?? 0,
    [report, decisions],
  );

  const confirmImport = useCallback(async () => {
    if (!report || !dataset || !config) return;
    setBusy('importing');
    setError(null);
    try {
      const result = buildImportBatch(report, decisions, dataset, config, fields);
      await trades.upsertMany(result.trades);
      await mappings.save(config);
      setBatch(result);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(null);
    }
  }, [config, dataset, decisions, fields, mappings, report, trades]);

  const restart = useCallback(() => {
    setStep('select');
    setSelectedId(null);
    setSchema(null);
    setRecords(null);
    setConfig(null);
    setRestored(null);
    setBatch(null);
    setDecisions({});
  }, []);

  return {
    fields,
    connector,
    step,
    setStep,
    datasets,
    savedIds,
    selectedId,
    setSelectedId,
    dataset,
    schema,
    records,
    config,
    restored,
    evaluation,
    report,
    decisions,
    includedCount,
    batch,
    busy,
    error,
    loadDatasets,
    startMapping,
    setMapping,
    confirmMapping,
    resetToSuggestions,
    goToValidation,
    setDecision,
    setDecisionForMany,
    confirmImport,
    restart,
  };
}

export type ImportWizardModel = ReturnType<typeof useImportWizard>;
