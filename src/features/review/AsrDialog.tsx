import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AsrDocument } from '../../domain/review/asr';
import type { DataSourceConnector, SourceDataset } from '../../domain/source/types';
import { blobToBase64, chartToPng, slugify } from '../../ui/charts/exportChart';
import { publishReview } from '../../sources/http/reviewPublisher';
import { Icon, Spinner } from '../../ui/primitives';

const TARGET_KEY = 'tradelens.asr.target.v1';

export interface AsrChart {
  key: string;
  label: string;
  ref: RefObject<HTMLElement | null>;
  title: string;
  subtitle?: string;
}

function storedTarget(): string | null {
  try {
    return localStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
}

type State = { kind: 'idle' } | { kind: 'sending'; step: string } | { kind: 'done'; url: string } | { kind: 'error'; message: string };

/**
 * "Create ASR in Notion": pick a Reviews database, choose which charts to
 * attach, and publish the period's Advanced Self Review as a new Notion page.
 */
export function AsrDialog({
  open,
  onClose,
  live,
  connector,
  apiBase,
  periodLabel,
  charts,
  build,
}: {
  open: boolean;
  onClose: () => void;
  live: boolean;
  connector: DataSourceConnector;
  apiBase: string;
  periodLabel: string;
  charts: AsrChart[];
  build: (images: string[]) => AsrDocument;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [datasets, setDatasets] = useState<SourceDataset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');
  const [include, setInclude] = useState<Set<string>>(() => new Set(charts.map((c) => c.key)));
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setState({ kind: 'idle' });
    setInclude(new Set(charts.map((c) => c.key)));
    if (datasets) return;
    connector
      .listDatasets()
      .then((list) => {
        setDatasets(list);
        const saved = storedTarget();
        const guess = list.find((d) => d.id === saved) ?? list.find((d) => /review|asr/i.test(d.name));
        setTarget(guess?.id ?? '');
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Could not load databases.'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!target) return;
    try {
      try {
        localStorage.setItem(TARGET_KEY, target);
      } catch {
        /* optional */
      }
      const chosen = charts.filter((c) => include.has(c.key) && c.ref.current);
      setState({ kind: 'sending', step: chosen.length ? 'Rendering charts…' : 'Building review…' });
      const images = [];
      for (const c of chosen) {
        const png = await chartToPng(c.ref.current!, { title: c.title, subtitle: c.subtitle });
        images.push({ key: c.key, filename: `${slugify(`${c.label} ${periodLabel}`)}.png`, base64: await blobToBase64(png) });
      }
      const document = build(images.map((i) => i.key));
      setState({ kind: 'sending', step: 'Creating page in Notion…' });
      const page = await publishReview(apiBase, { dataSourceId: target, document, images });
      setState({ kind: 'done', url: page.url });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  };

  const toggle = (key: string) =>
    setInclude((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sending = state.kind === 'sending';

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={(e) => sending && e.preventDefault()} aria-labelledby="asr-title">
      <header className="dialog__head">
        <div>
          <h2 id="asr-title" className="section-title">
            Create ASR in Notion
          </h2>
          <p className="section-sub">Advanced Self Review for {periodLabel}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={sending}>
          <Icon name="x" size={14} />
        </button>
      </header>

      {state.kind === 'done' ? (
        <div className="dialog__body dialog__done">
          <span className="dialog__done-icon">
            <Icon name="check" size={18} />
          </span>
          <p>
            <strong>Your review page is ready.</strong>
            <br />
            <span className="muted">Scorecard, charts and trades are filled in — add your reflections in Notion.</span>
          </p>
          <div className="dialog__actions">
            <button className="btn btn--ghost" onClick={onClose}>
              Done
            </button>
            <a className="btn btn--primary" href={state.url} target="_blank" rel="noreferrer">
              Open in Notion <Icon name="external" size={14} />
            </a>
          </div>
        </div>
      ) : (
        <div className="dialog__body">
          {!live && (
            <p className="notice notice--warning">
              <Icon name="info" size={14} /> You're viewing demo data. Connect your Notion workspace to publish reviews.
            </p>
          )}

          <label className="field">
            <span className="label">Reviews database</span>
            <span className="select">
              <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!datasets || sending}>
                <option value="">{datasets ? 'Choose a database…' : 'Loading databases…'}</option>
                {datasets?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.icon ? `${d.icon} ` : ''}
                    {d.name}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={12} className="select__chevron" />
            </span>
            <span className="muted small">
              {loadError ??
                'A new page is added to this database. Title, period, dates, Net R, win rate, trades and P/L fill matching properties automatically.'}
            </span>
          </label>

          <fieldset className="dialog__fieldset">
            <legend className="label">Include</legend>
            <ul className="dialog__checks">
              <li>
                <Icon name="check" size={12} /> Scorecard vs last period, setups, best & worst trades, behaviour tags, flow and missed trades
              </li>
              <li>
                <Icon name="check" size={12} /> Reflection prompts and an action list to fill in
              </li>
              {charts.map((c) => (
                <li key={c.key}>
                  <label className="check">
                    <input type="checkbox" checked={include.has(c.key)} onChange={() => toggle(c.key)} disabled={sending} />
                    {c.label} chart
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {state.kind === 'error' && (
            <p className="notice notice--error" role="alert">
              <Icon name="alert" size={14} /> {state.message}
            </p>
          )}

          <div className="dialog__actions">
            <button className="btn btn--ghost" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={() => void submit()} disabled={!live || !target || sending}>
              {sending ? (
                <>
                  <Spinner /> {state.step}
                </>
              ) : (
                <>
                  <Icon name="send" size={14} /> Create review page
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
