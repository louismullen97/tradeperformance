import type { ImportWizardModel } from '../useImportWizard';
import { Badge, Icon, relativeTime, Spinner } from '../../../ui/primitives';

export function SelectDatabaseStep({ wizard }: { wizard: ImportWizardModel }) {
  const { datasets, savedIds, selectedId, setSelectedId, busy, startMapping, connector } = wizard;
  const loading = busy === 'datasets' && !datasets;

  return (
    <>
      <div className="step-intro">
        <div>
          <h2 className="step-title">Choose a trade database</h2>
          <p className="step-sub">
            Databases shared with the {connector.label} integration. We read the structure and records — nothing is
            written back to {connector.label}.
          </p>
        </div>
        <button className="btn btn--ghost" onClick={() => void wizard.loadDatasets()} disabled={busy !== null}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="db-grid" role="radiogroup" aria-label="Notion databases">
        {loading &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="db-card db-card--skeleton" aria-hidden="true" />)}
        {datasets?.map((d) => {
          const selected = d.id === selectedId;
          return (
            <button
              key={d.id}
              role="radio"
              aria-checked={selected}
              className={`db-card ${selected ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(d.id)}
            >
              <div className="db-card__top">
                <span className="db-card__icon">{d.icon ?? '🗂️'}</span>
                <span className="db-card__radio" aria-hidden="true">
                  {selected && <Icon name="check" size={12} />}
                </span>
              </div>
              <div className="db-card__name">{d.name}</div>
              <div className="db-card__meta">
                {connector.label} database · {d.workspace}
              </div>
              <dl className="db-card__stats">
                <div>
                  <dt className="eyebrow">Records</dt>
                  <dd>{d.recordCount}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Edited</dt>
                  <dd>{relativeTime(d.lastEditedTime)}</dd>
                </div>
              </dl>
              {savedIds.has(d.id) && (
                <div className="db-card__saved">
                  <Badge tone="accent" icon="layers">
                    Saved mapping
                  </Badge>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {datasets && datasets.length === 0 && (
        <div className="empty">
          <Icon name="database" size={20} />
          <p>No databases are shared with the integration yet.</p>
        </div>
      )}

      <footer className="action-bar">
        <span className="action-bar__hint">
          {selectedId ? 'Next: match its properties to Tradelens fields.' : 'Select a database to continue.'}
        </span>
        <button className="btn btn--primary" disabled={!selectedId || busy !== null} onClick={() => void startMapping()}>
          {busy === 'loading' ? (
            <>
              <Spinner /> Reading database…
            </>
          ) : (
            <>
              Continue <Icon name="arrowRight" />
            </>
          )}
        </button>
      </footer>
    </>
  );
}
