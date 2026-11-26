import { useMemo, useState } from 'react';
import type { FieldDefinition } from '../../../domain/fields/types';
import { VALUE_KIND_LABEL } from '../../../domain/mapping/compatibility';
import type { ReconcileChange } from '../../../domain/mapping/reconcile';
import { rankCandidates, SUGGEST_THRESHOLD } from '../../../domain/mapping/suggest';
import type { FieldMappingState, MappingConfig } from '../../../domain/mapping/types';
import type { SourceProperty, SourceRecord } from '../../../domain/source/types';
import { displaySourceValue, isEmptyValue } from '../../../domain/source/types';
import type { ImportWizardModel } from '../useImportWizard';
import { Badge, Icon, MappingStatusBadge, Stat } from '../../../ui/primitives';

const TYPE_LABEL: Record<string, string> = {
  title: 'Title',
  text: 'Text',
  number: 'Number',
  select: 'Select',
  multi_select: 'Multi-select',
  date: 'Date',
  checkbox: 'Checkbox',
  url: 'URL',
  files: 'Files',
  unknown: 'Unknown',
};

function propertyTypeLabel(p: SourceProperty) {
  if (p.nativeType === 'formula') return `Formula → ${TYPE_LABEL[p.type]}`;
  if (p.nativeType === 'status') return 'Status';
  if (p.type === 'number' && p.numberFormat === 'percent') return 'Number (%)';
  return TYPE_LABEL[p.type] ?? p.type;
}

function samplesFor(records: SourceRecord[], propertyId: string, n = 3): string[] {
  const out: string[] = [];
  for (const r of records) {
    const v = r.values[propertyId];
    if (isEmptyValue(v)) continue;
    const text = displaySourceValue(v);
    if (!out.includes(text)) out.push(text);
    if (out.length >= n) break;
  }
  return out;
}

function describeChange(c: ReconcileChange, fields: readonly FieldDefinition[]) {
  const label = fields.find((f) => f.key === c.fieldKey)?.label ?? c.fieldKey;
  switch (c.type) {
    case 'renamed':
      return `“${c.from}” was renamed to “${c.to}” — still mapped to ${label}.`;
    case 'relinked':
      return `${label} re-linked to “${c.propertyName}”.`;
    case 'removed':
      return `“${c.propertyName}” (${label}) no longer exists in the database.`;
    case 'new_field':
      return c.suggested ? `New field ${label} suggested from “${c.suggested}”.` : `New field ${label} available.`;
  }
}

interface RowProps {
  field: FieldDefinition;
  state: FieldMappingState;
  config: MappingConfig;
  properties: SourceProperty[];
  records: SourceRecord[];
  fields: readonly FieldDefinition[];
  onChange: (propertyId: string | null) => void;
  onConfirm: () => void;
}

function MappingRow({ field, state, config, properties, records, fields, onChange, onConfirm }: RowProps) {
  const entry = config.entries[field.key];
  const selectedId = entry?.propertyId ?? '';
  const selectedProperty = properties.find((p) => p.id === selectedId);

  const usedBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of fields) {
      const pid = config.entries[f.key]?.propertyId;
      if (pid && f.key !== field.key) m.set(pid, [...(m.get(pid) ?? []), f.label]);
    }
    return m;
  }, [config, field.key, fields]);

  const groups = useMemo(() => {
    const ranked = rankCandidates(field, properties);
    return {
      suggested: ranked.filter((c) => c.compatibility !== 'incompatible' && c.score >= SUGGEST_THRESHOLD),
      native: ranked.filter((c) => c.compatibility === 'native' && c.score < SUGGEST_THRESHOLD),
      convertible: ranked.filter((c) => c.compatibility === 'convertible' && c.score < SUGGEST_THRESHOLD),
      incompatible: ranked.filter((c) => c.compatibility === 'incompatible'),
    };
  }, [field, properties]);

  const optionLabel = (p: SourceProperty) => {
    const used = usedBy.get(p.id);
    return `${p.name}  ·  ${propertyTypeLabel(p)}${used ? `  (used by ${used.join(', ')})` : ''}`;
  };

  const samples = selectedProperty ? samplesFor(records, selectedProperty.id) : [];
  const selectId = `map-${field.key}`;

  return (
    <div className={`map-row map-row--${state.status} ${state.blocking ? 'is-blocking' : ''}`}>
      <div className="map-row__field">
        <label htmlFor={selectId} className="map-row__label">
          {field.label}
          {field.required && <span className="req-dot" title="Mandatory" aria-label="mandatory" />}
        </label>
        <div className="map-row__key">
          <code>{field.key}</code>
          <span className="type-chip">{VALUE_KIND_LABEL[field.valueKind]}</span>
        </div>
      </div>

      <div className="map-row__arrow" aria-hidden="true">
        <Icon name="arrowLeft" />
      </div>

      <div className="map-row__source">
        <div className="select">
          <select id={selectId} value={selectedId} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">{field.required ? '— Select a property —' : '— Not mapped —'}</option>
            {state.status === 'stale' && selectedId && (
              <option value={selectedId} disabled>
                {entry?.propertyNameSnapshot} (removed)
              </option>
            )}
            {groups.suggested.length > 0 && (
              <optgroup label="Suggested">
                {groups.suggested.map((c) => (
                  <option key={c.property.id} value={c.property.id}>
                    {optionLabel(c.property)}
                  </option>
                ))}
              </optgroup>
            )}
            {groups.native.length > 0 && (
              <optgroup label="Compatible">
                {groups.native.map((c) => (
                  <option key={c.property.id} value={c.property.id}>
                    {optionLabel(c.property)}
                  </option>
                ))}
              </optgroup>
            )}
            {groups.convertible.length > 0 && (
              <optgroup label="Requires conversion">
                {groups.convertible.map((c) => (
                  <option key={c.property.id} value={c.property.id}>
                    {optionLabel(c.property)}
                  </option>
                ))}
              </optgroup>
            )}
            {groups.incompatible.length > 0 && (
              <optgroup label="Incompatible type">
                {groups.incompatible.map((c) => (
                  <option key={c.property.id} value={c.property.id} disabled>
                    {c.property.name}  ·  {propertyTypeLabel(c.property)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Icon name="chevronDown" className="select__chevron" />
        </div>
        <div className="map-row__samples">
          {samples.length > 0 ? (
            <>
              <span className="eyebrow">Sample</span>
              {samples.map((s) => (
                <span key={s} className="sample">
                  {s}
                </span>
              ))}
            </>
          ) : selectedProperty ? (
            <span className="muted">No values in this property</span>
          ) : (
            <span className="muted">{field.description}</span>
          )}
        </div>
      </div>

      <div className="map-row__status">
        <MappingStatusBadge status={state.status} />
        {state.status === 'uncertain' && (
          <button className="btn btn--xs" onClick={onConfirm}>
            Confirm
          </button>
        )}
        {entry?.origin === 'auto' && entry.confidence !== null && state.status !== 'unmapped' && (
          <span className="confidence" title="Match confidence">
            {Math.round(entry.confidence * 100)}%
          </span>
        )}
      </div>

      {state.messages.length > 0 && (
        <ul className="map-row__messages">
          {state.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MapPropertiesStep({ wizard }: { wizard: ImportWizardModel }) {
  const { config, schema, records, evaluation, fields, dataset, restored } = wizard;
  const [showOptional, setShowOptional] = useState(true);
  if (!config || !schema || !records || !evaluation || !dataset) return null;

  const mandatory = fields.filter((f) => f.required);
  const optional = fields.filter((f) => !f.required);
  const s = evaluation.summary;
  const mandatoryPct = (s.mandatoryMapped / s.mandatoryTotal) * 100;

  const rowProps = (field: FieldDefinition) => ({
    field,
    state: evaluation.fields[field.key],
    config,
    properties: schema.properties,
    records,
    fields,
    onChange: (pid: string | null) => wizard.setMapping(field.key, pid),
    onConfirm: () => wizard.confirmMapping(field.key),
  });

  const blockingFields = fields.filter((f) => evaluation.fields[f.key].blocking).map((f) => f.label);

  return (
    <>
      <div className="step-intro">
        <div>
          <h2 className="step-title">
            Map <span className="hl">{dataset.icon} {dataset.name}</span>
          </h2>
          <p className="step-sub">
            We matched {schema.properties.length} properties to Tradelens fields by name and type. Every suggestion can be
            changed.
          </p>
        </div>
        <button className="btn btn--ghost" onClick={wizard.resetToSuggestions}>
          <Icon name="sparkle" /> Reset to suggestions
        </button>
      </div>

      {restored && (
        <div className="callout callout--accent">
          <Icon name="layers" />
          <div>
            <strong>Saved mapping applied.</strong>{' '}
            {restored.changes.length === 0
              ? 'The database structure is unchanged since it was saved.'
              : 'The database changed since it was saved:'}
            {restored.changes.length > 0 && (
              <ul>
                {restored.changes.map((c, i) => (
                  <li key={i}>{describeChange(c, fields)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="stat-row">
        <Stat
          label="Mandatory mapped"
          value={s.mandatoryMapped}
          unit={`/ ${s.mandatoryTotal}`}
          tone={s.mandatoryMapped === s.mandatoryTotal ? 'positive' : 'negative'}
          foot={
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${mandatoryPct}%` }} />
            </div>
          }
        />
        <Stat label="Auto-matched" value={s.autoMatched} tone="positive" foot="High-confidence name + type match" />
        <Stat label="Needs review" value={s.uncertain} tone={s.uncertain ? 'warning' : undefined} foot="Partial match or conversion" />
        <Stat
          label="Missing / blocked"
          value={s.blocking}
          tone={s.blocking ? 'negative' : undefined}
          foot={s.blocking ? 'Resolve before continuing' : 'Nothing blocking'}
        />
      </div>

      <section className="panel map-panel">
        <header className="panel__head">
          <h3 className="eyebrow">
            Mandatory fields <span className="count">{s.mandatoryMapped}/{s.mandatoryTotal}</span>
          </h3>
          <span className="panel__aside muted">Required by the analytics engine</span>
        </header>
        <div className="map-head" aria-hidden="true">
          <span>Tradelens field</span>
          <span />
          <span>Notion property</span>
          <span>Status</span>
        </div>
        {mandatory.map((f) => (
          <MappingRow key={f.key} {...rowProps(f)} />
        ))}
      </section>

      <section className="panel map-panel">
        <header className="panel__head">
          <button className="disclosure" onClick={() => setShowOptional((v) => !v)} aria-expanded={showOptional}>
            <Icon name={showOptional ? 'chevronDown' : 'chevronRight'} />
            <h3 className="eyebrow">
              Optional fields <span className="count">{s.optionalMapped}/{s.optionalTotal}</span>
            </h3>
          </button>
          <span className="panel__aside muted">Enrich analytics — safe to leave unmapped</span>
        </header>
        {showOptional && optional.map((f) => <MappingRow key={f.key} {...rowProps(f)} />)}
      </section>

      <footer className="action-bar">
        <button className="btn btn--ghost" onClick={() => wizard.setStep('select')}>
          <Icon name="arrowLeft" /> Back
        </button>
        <span className="action-bar__hint">
          {evaluation.canProceed ? (
            <>
              <Badge tone="positive" icon="check">
                Ready
              </Badge>{' '}
              Mapping will be saved for future syncs.
            </>
          ) : (
            <>Resolve: {blockingFields.join(', ')}</>
          )}
        </span>
        <button className="btn btn--primary" disabled={!evaluation.canProceed} onClick={() => void wizard.goToValidation()}>
          Validate data <Icon name="arrowRight" />
        </button>
      </footer>
    </>
  );
}
