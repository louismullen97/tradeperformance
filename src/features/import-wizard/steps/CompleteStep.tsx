import { useState } from 'react';
import type { ImportWizardModel } from '../useImportWizard';
import { Icon, Panel, Stat } from '../../../ui/primitives';

export function CompleteStep({ wizard }: { wizard: ImportWizardModel }) {
  const { batch, dataset } = wizard;
  const [showJson, setShowJson] = useState(false);
  if (!batch || !dataset) return null;
  const sample = batch.trades[0];

  return (
    <>
      <div className="success">
        <span className="success__icon">
          <Icon name="check" size={20} />
        </span>
        <div>
          <h2 className="step-title">{batch.counts.imported} trades imported</h2>
          <p className="step-sub">
            From {dataset.icon} {dataset.name}. The mapping is saved and will be re-applied the next time this database
            syncs.
          </p>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Imported" value={batch.counts.imported} tone="positive" />
        <Stat label="Skipped by you" value={batch.counts.skippedByUser} />
        <Stat label="Excluded (invalid)" value={batch.counts.skippedInvalid} tone={batch.counts.skippedInvalid ? 'negative' : undefined} />
        <Stat label="Batch" value={<code className="batch-id">{batch.id}</code>} foot={new Date(batch.createdAt).toLocaleString()} />
      </div>

      {batch.skipped.length > 0 && (
        <Panel title={`Not imported · ${batch.skipped.length}`} flush>
          <ul className="skipped-list">
            {batch.skipped.map((s) => (
              <li key={s.recordId}>
                <span className={`dot dot--${s.reason === 'invalid' ? 'negative' : 'neutral'}`} />
                <span className="skipped-list__reason">{s.reason === 'invalid' ? 'Invalid' : 'Excluded by you'}</span>
                <span className="skipped-list__msg">{s.issues[0] ?? 'Excluded by user.'}</span>
                {s.recordUrl && (
                  <a href={s.recordUrl} target="_blank" rel="noreferrer" className="link">
                    Open <Icon name="external" size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {sample && (
        <Panel
          title="Standardised record"
          aside={
            <button className="btn btn--xs" onClick={() => setShowJson((v) => !v)}>
              {showJson ? 'Hide' : 'Show'} JSON
            </button>
          }
        >
          <p className="muted">
            How trades are stored for the analytics engine — independent of the Notion property names, with provenance
            back to the source page.
          </p>
          {showJson && <pre className="json">{JSON.stringify(sample, null, 2)}</pre>}
        </Panel>
      )}

      <footer className="action-bar">
        <span className="action-bar__hint">Analytics will update once the engine processes this batch.</span>
        <button className="btn btn--primary" onClick={wizard.restart}>
          Import another database
        </button>
      </footer>
    </>
  );
}
