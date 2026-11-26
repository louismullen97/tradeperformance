import { Fragment, useMemo, useState } from 'react';
import { canInclude } from '../../../domain/import/importService';
import type { IssueCode, RecordStatus, RecordValidation } from '../../../domain/validation/types';
import { ISSUE_LABEL } from '../../../domain/validation/types';
import type { ImportWizardModel } from '../useImportWizard';
import {
  Badge,
  fmtDate,
  fmtPct,
  fmtR,
  fmtRisk,
  Icon,
  Panel,
  RecordStatusBadge,
  signTone,
  Spinner,
  Stat,
} from '../../../ui/primitives';

type Filter = 'all' | RecordStatus | IssueCode;
const PAGE = 20;

const COLUMNS: { key: string; label: string; fmt: (v: unknown) => string; num?: boolean; tone?: boolean }[] = [
  { key: 'trade_date', label: 'Date', fmt: (v) => fmtDate(v as string) },
  { key: 'currency_pair', label: 'Pair', fmt: (v) => (v as string) ?? '—' },
  { key: 'setup', label: 'Setup', fmt: (v) => (v as string) ?? '—' },
  { key: 'risk_percentage', label: 'Risk', fmt: fmtRisk, num: true },
  { key: 'result_r', label: 'Result', fmt: fmtR, num: true, tone: true },
  { key: 'profit_loss_percentage', label: 'P/L', fmt: fmtPct, num: true, tone: true },
];

function RecordDetail({ r, wizard }: { r: RecordValidation; wizard: ImportWizardModel }) {
  const mapped = wizard.fields.filter((f) => r.cells[f.key]);
  return (
    <div className="detail">
      <div className="detail__issues">
        {r.issues.length === 0 ? (
          <p className="muted">No issues — this record is ready to import.</p>
        ) : (
          <ul>
            {r.issues.map((i, idx) => (
              <li key={idx} className={`issue issue--${i.severity}`}>
                <Icon name={i.severity === 'error' ? 'x' : 'alert'} size={12} />
                <span>
                  <strong>{ISSUE_LABEL[i.code]}</strong> — {i.message}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="detail__trace">
          <span className="eyebrow">Source record</span>
          <code>{r.record.id}</code>
          {r.record.url && (
            <a href={r.record.url} target="_blank" rel="noreferrer" className="link">
              Open in {wizard.connector.label} <Icon name="external" size={12} />
            </a>
          )}
        </div>
      </div>
      <table className="trace-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Source property</th>
            <th>Original value</th>
            <th>Imported as</th>
          </tr>
        </thead>
        <tbody>
          {mapped.map((f) => {
            const c = r.cells[f.key];
            const v = c.value;
            return (
              <tr key={f.key} className={c.issue ? 'has-issue' : ''}>
                <td>
                  <code>{f.key}</code>
                </td>
                <td>{c.propertyName}</td>
                <td className="mono">{c.rawDisplay}</td>
                <td className="mono">
                  {v === null ? <span className="muted">—</span> : Array.isArray(v) ? v.join(', ') : String(v)}
                  {c.converted && v !== null && <span className="conv">converted</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ValidateStep({ wizard }: { wizard: ImportWizardModel }) {
  const { report, decisions, includedCount, dataset, busy } = wizard;
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    if (!report) return [];
    if (filter === 'all') return report.records;
    if (filter === 'valid' || filter === 'attention' || filter === 'excluded')
      return report.records.filter((r) => r.status === filter);
    return report.records.filter((r) => r.issues.some((i) => i.code === filter));
  }, [report, filter]);

  if (!report || !dataset) return null;
  const { counts } = report;
  const pct = (n: number) => `${(n / Math.max(counts.total, 1)) * 100}%`;
  const attentionIds = report.records.filter((r) => r.status === 'attention').map((r) => r.record.id);
  const notes = Object.entries(report.columnNotes);

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.total },
    { key: 'valid', label: 'Valid', n: counts.valid },
    { key: 'attention', label: 'Needs attention', n: counts.attention },
    { key: 'excluded', label: 'Excluded', n: counts.excluded },
  ];

  return (
    <>
      <div className="step-intro">
        <div>
          <h2 className="step-title">Validate &amp; preview</h2>
          <p className="step-sub">
            Every record from {dataset.name} is listed below. Nothing is dropped silently — excluded records stay visible
            with the reason.
          </p>
        </div>
      </div>

      <div className="metrics metrics--5">
        <Stat label="Records read" value={counts.total} foot={`From ${dataset.name}`} />
        <Stat label="Valid" value={counts.valid} tone="positive" foot="Ready to import" />
        <Stat label="Needs attention" value={counts.attention} tone={counts.attention ? 'warning' : undefined} foot="Importable — your call" />
        <Stat label="Excluded" value={counts.excluded} tone={counts.excluded ? 'negative' : undefined} foot="Missing or invalid mandatory data" />
        <Stat label="Will import" value={includedCount} tone="accent" foot={`${counts.total - includedCount} skipped`} />
      </div>

      <div className="split-bar" role="img" aria-label={`${counts.valid} valid, ${counts.attention} need attention, ${counts.excluded} excluded`}>
        <span className="split-bar__valid" style={{ width: pct(counts.valid) }} />
        <span className="split-bar__attention" style={{ width: pct(counts.attention) }} />
        <span className="split-bar__excluded" style={{ width: pct(counts.excluded) }} />
      </div>

      <div className="validate-grid">
        <Panel title="Issues found">
          {Object.keys(report.issueCounts).length === 0 ? (
            <p className="muted">No issues detected.</p>
          ) : (
            <ul className="issue-list">
              {(Object.entries(report.issueCounts) as [IssueCode, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => (
                  <li key={code}>
                    <button className={`issue-chip ${filter === code ? 'is-active' : ''}`} onClick={() => setFilter(filter === code ? 'all' : code)}>
                      <span className={`dot dot--${['missing_required', 'invalid_required', 'empty_record'].includes(code) ? 'negative' : 'warning'}`} />
                      {ISSUE_LABEL[code]}
                      <span className="issue-chip__n">{n}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
        <Panel title="Conversions applied">
          {notes.length === 0 ? (
            <p className="muted">All mapped values were used as-is.</p>
          ) : (
            <ul className="note-list">
              {notes.map(([key, msgs]) => (
                <li key={key}>
                  <code>{key}</code>
                  {msgs.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="panel">
        <header className="panel__head panel__head--wrap">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={filter === t.key}
                className={`tab ${filter === t.key ? 'is-active' : ''}`}
                onClick={() => {
                  setFilter(t.key);
                  setLimit(PAGE);
                }}
              >
                {t.label} <span className="tab__n">{t.n}</span>
              </button>
            ))}
            {!['all', 'valid', 'attention', 'excluded'].includes(filter) && (
              <span className="tab is-active">
                {ISSUE_LABEL[filter as IssueCode]}
                <button className="tab__clear" aria-label="Clear filter" onClick={() => setFilter('all')}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            )}
          </div>
          {attentionIds.length > 0 && (
            <div className="panel__aside bulk">
              <span className="muted">Needs attention:</span>
              <button className="btn btn--xs" onClick={() => wizard.setDecisionForMany(attentionIds, 'include')}>
                Include all
              </button>
              <button className="btn btn--xs" onClick={() => wizard.setDecisionForMany(attentionIds, 'exclude')}>
                Exclude all
              </button>
            </div>
          )}
        </header>

        <div className="table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th className="col-check">Import</th>
                <th>Status</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
                <th>Issues</th>
                <th aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => {
                const id = r.record.id;
                const includable = canInclude(r);
                const included = includable && decisions[id] === 'include';
                const open = expanded === id;
                return (
                  <Fragment key={id}>
                    <tr className={`row row--${r.status} ${included ? '' : 'is-skipped'} ${open ? 'is-open' : ''}`}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={included}
                          disabled={!includable}
                          title={includable ? 'Include in import' : 'Cannot be imported — mandatory data missing or invalid'}
                          aria-label={`Include record ${id}`}
                          onChange={(e) => wizard.setDecision(id, e.target.checked ? 'include' : 'exclude')}
                        />
                      </td>
                      <td>
                        <RecordStatusBadge status={r.status} />
                      </td>
                      {COLUMNS.map((c) => {
                        const cell = r.cells[c.key];
                        const v = r.values[c.key];
                        return (
                          <td
                            key={c.key}
                            className={`${c.num ? 'num' : ''} ${c.tone ? signTone(v) : ''} ${cell?.issue ? `cell-issue cell-issue--${['missing_required', 'invalid_required'].includes(cell.issue) ? 'error' : 'warning'}` : ''}`}
                            title={cell ? `${cell.propertyName}: ${cell.rawDisplay}` : undefined}
                          >
                            {v === null && cell && cell.rawDisplay !== '—' ? (
                              <span className="raw">{cell.rawDisplay}</span>
                            ) : (
                              c.fmt(v)
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <div className="issues-cell">
                          {r.issues.slice(0, 2).map((i, idx) => (
                            <Badge key={idx} tone={i.severity === 'error' ? 'negative' : 'warning'}>
                              {ISSUE_LABEL[i.code]}
                            </Badge>
                          ))}
                          {r.issues.length > 2 && <span className="muted">+{r.issues.length - 2}</span>}
                        </div>
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-expanded={open}
                          aria-label="Show source details"
                          onClick={() => setExpanded(open ? null : id)}
                        >
                          <Icon name={open ? 'chevronDown' : 'chevronRight'} />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="detail-row">
                        <td colSpan={COLUMNS.length + 4}>
                          <RecordDetail r={r} wizard={wizard} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="table-more">
            <button className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit}
            </button>
          </div>
        )}
        {filtered.length === 0 && <p className="empty">No records in this view.</p>}
      </section>

      {wizard.error && <div className="callout callout--negative">{wizard.error}</div>}

      <footer className="action-bar">
        <button className="btn btn--ghost" onClick={() => wizard.setStep('map')}>
          <Icon name="arrowLeft" /> Back to mapping
        </button>
        <span className="action-bar__hint">
          {includedCount} of {counts.total} records will be imported. Skipped records are kept in the import report.
        </span>
        <button className="btn btn--primary" disabled={includedCount === 0 || busy !== null} onClick={() => void wizard.confirmImport()}>
          {busy === 'importing' ? (
            <>
              <Spinner /> Importing…
            </>
          ) : (
            <>
              Import {includedCount} trades <Icon name="arrowRight" />
            </>
          )}
        </button>
      </footer>
    </>
  );
}
