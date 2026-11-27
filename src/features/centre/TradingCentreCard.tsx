import { useState } from 'react';
import { ROLE_LABEL, type Detection } from '../../domain/centre/detect';
import { loadCentre } from '../../domain/centre/settings';
import { detectCentre, syncCentre, type SyncOutcome } from '../../domain/centre/sync';
import type { ImportServices } from '../import-wizard/useImportWizard';
import { Icon, relativeTime, Spinner } from '../../ui/primitives';

const ROLE_ICON: Record<string, string> = { trades: '📒', daily: '🗓️', flow: '🧘', plans: '🎯', playbook: '📘', reviews: '🧭' };
const ORDER = ['trades', 'daily', 'flow', 'plans', 'playbook', 'reviews'];

function outcomeText(o: SyncOutcome | 'syncing' | undefined, d: Detection) {
  if (o === 'syncing') return <><Spinner /> Syncing…</>;
  if (!o) return d.role === 'reviews' ? <span className="muted">ASR pages are written here</span> : <span className="muted">{d.dataset.recordCount ?? '—'} records</span>;
  if (o.status === 'synced') return <span className="num-gain"><Icon name="check" size={12} /> {o.result.imported} {o.result.imported === 1 ? 'record' : 'records'} synced{o.result.skippedInvalid ? ` · ${o.result.skippedInvalid} skipped` : ''}</span>;
  if (o.status === 'linked') return <span className="num-gain"><Icon name="check" size={12} /> Linked for ASR pages</span>;
  if (o.status === 'needs_mapping') return <span className="text-warning"><Icon name="alert" size={12} /> {o.message}</span>;
  return <span className="num-loss"><Icon name="alert" size={12} /> {o.message}</span>;
}

/** One-click setup: detect every database in the shared Trading Centre and sync them all. */
export function TradingCentreCard({ services, onOpenWizard }: { services: ImportServices; onOpenWizard: () => void }) {
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, SyncOutcome | 'syncing'>>({});
  const [busy, setBusy] = useState<'detect' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(() => loadCentre().lastSync);

  const detect = async () => {
    setBusy('detect');
    setError(null);
    setOutcomes({});
    try {
      setDetections(await detectCentre(services.connector, services.targets));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read your databases.');
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    if (!detections) return;
    setBusy('sync');
    await syncCentre(detections, services, (id, o) => setOutcomes((prev) => ({ ...prev, [id]: o })));
    setLastSync(loadCentre().lastSync);
    setBusy(null);
  };

  const recognised = (detections ?? []).filter((d) => d.role).sort((a, b) => ORDER.indexOf(a.role!) - ORDER.indexOf(b.role!));
  const other = (detections ?? []).filter((d) => !d.role);
  const synced = Object.values(outcomes).some((o) => o !== 'syncing');

  return (
    <section className="panel centre-card">
      <header className="panel__head">
        <div className="centre-card__title">
          <span className="centre-card__icon" aria-hidden="true">🧭</span>
          <div>
            <h2 className="section-title">Trading Centre</h2>
            <p className="section-sub">
              Share your Trading Centre page with Tradelens and every database on it is recognised and synced in one go — no mapping needed.
              {lastSync && <> Last synced {relativeTime(lastSync)}.</>}
            </p>
          </div>
        </div>
        {!detections ? (
          <button className="btn btn--primary" onClick={() => void detect()} disabled={busy !== null}>
            {busy === 'detect' ? <><Spinner /> Reading databases…</> : <><Icon name="search" size={14} /> {lastSync ? 'Sync again' : 'Find my databases'}</>}
          </button>
        ) : (
          <div className="centre-card__actions">
            <button className="btn btn--ghost" onClick={() => void detect()} disabled={busy !== null}>
              <Icon name="refresh" size={14} /> Re-scan
            </button>
            <button className="btn btn--primary" onClick={() => void sync()} disabled={busy !== null || recognised.length === 0}>
              {busy === 'sync' ? <><Spinner /> Syncing…</> : synced ? 'Sync again' : `Sync ${recognised.length} database${recognised.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </header>

      {error && (
        <p className="notice notice--error centre-card__error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}

      {detections && (
        <ul className="centre-list">
          {recognised.map((d) => (
            <li key={d.dataset.id} className="centre-row">
              <span className="centre-row__icon" aria-hidden="true">{ROLE_ICON[d.role!]}</span>
              <span className="centre-row__main">
                <span className="strong">{d.dataset.name}</span>
                <span className="centre-row__role">Detected as {d.role === 'daily' ? 'Daily ASR' : ROLE_LABEL[d.role!].toLowerCase()}</span>
              </span>
              <span className="centre-row__status small">{outcomeText(outcomes[d.dataset.id], d)}</span>
            </li>
          ))}
          {other.map((d) => (
            <li key={d.dataset.id} className="centre-row is-other">
              <span className="centre-row__icon" aria-hidden="true">🗂️</span>
              <span className="centre-row__main">
                <span className="strong">{d.dataset.name}</span>
                <span className="centre-row__role muted">Not recognised</span>
              </span>
              <span className="centre-row__status small">
                <button className="link small" onClick={onOpenWizard}>
                  Map it manually <Icon name="arrowRight" size={12} />
                </button>
              </span>
            </li>
          ))}
          {detections.length === 0 && <li className="centre-row muted">No databases are shared with Tradelens yet. In Notion, open your Trading Centre page → ••• → Connections → add Tradelens.</li>}
        </ul>
      )}
    </section>
  );
}
