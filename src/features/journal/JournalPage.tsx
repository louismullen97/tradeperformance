import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { TRADE_FIELDS } from '../../domain/fields/registry';
import type { TradeRepository } from '../../domain/trades/repository';
import { takenOnly } from '../../domain/trades/status';
import { amountOf, outcomeOf, summarise, type Outcome } from '../../domain/trades/summary';
import type { StandardTrade, TradeFieldValue } from '../../domain/trades/types';
import { FilterSelect } from '../../ui/FilterSelect';
import { PageHeader } from '../../ui/PageHeader';
import { Badge, fmtAmount, fmtDate, fmtPct, fmtR, fmtRisk, Icon, signTone, Stat } from '../../ui/primitives';

type SortKey = 'trade_date' | 'result_r' | 'profit_loss_percentage' | 'risk_percentage';
type Filters = { pair: string; setup: string; management: string; account: string; outcome: '' | Outcome; dataset: string };
const NO_FILTERS: Filters = { pair: '', setup: '', management: '', account: '', outcome: '', dataset: '' };

const OUTCOME_LABEL: Record<Outcome, string> = { win: 'Win', loss: 'Loss', breakeven: 'BE' };
const OUTCOME_TONE = { win: 'positive', loss: 'negative', breakeven: 'neutral' } as const;

const optionalText = (t: StandardTrade, key: string) => {
  const v = t.optional[key];
  return typeof v === 'string' ? v : null;
};


const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

function formatOptional(v: TradeFieldValue, key: string) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    if (key === 'screenshots')
      return v.map((url, i) => (
        <a key={url} className="link" href={url} target="_blank" rel="noreferrer">
          Link {i + 1} <Icon name="external" size={12} />
        </a>
      ));
    return v.join(', ');
  }
  if (key === 'date_closed') return fmtDate(String(v));
  return String(v);
}

export function JournalPage({ trades: repo }: { trades: TradeRepository }) {
  const [trades, setTrades] = useState<StandardTrade[] | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'trade_date', dir: -1 });
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(() => void repo.list().then((l) => setTrades(takenOnly(l))), [repo]);
  useEffect(reload, [reload]);

  const options = useMemo(() => {
    const all = trades ?? [];
    return {
      pairs: uniq(all.map((t) => t.currency_pair)),
      setups: uniq(all.map((t) => t.setup)),
      managements: uniq(all.map((t) => optionalText(t, 'management_style'))),
      accounts: uniq(all.map((t) => optionalText(t, 'account'))),
      datasets: [...new Map(all.map((t) => [t.source.datasetId, t.source])).values()],
    };
  }, [trades]);

  const visible = useMemo(() => {
    const f = filters;
    return (trades ?? [])
      .filter(
        (t) =>
          (!f.pair || t.currency_pair === f.pair) &&
          (!f.setup || t.setup === f.setup) &&
          (!f.management || optionalText(t, 'management_style') === f.management) &&
          (!f.account || optionalText(t, 'account') === f.account) &&
          (!f.outcome || outcomeOf(t) === f.outcome) &&
          (!f.dataset || t.source.datasetId === f.dataset),
      )
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return cmp * sort.dir || a.id.localeCompare(b.id);
      });
  }, [trades, filters, sort]);

  const s = useMemo(() => summarise(visible), [visible]);
  const filtered = Object.values(filters).some(Boolean);

  const removeDataset = async (datasetId: string, name: string, count: number) => {
    if (!window.confirm(`Remove ${count} trades imported from “${name}”? Your Notion data isn't affected — you can re-import any time.`)) return;
    await repo.removeDataset(datasetId);
    setFilters(NO_FILTERS);
    reload();
  };

  const header = (key: SortKey, label: string) => (
    <th className="num">
      <button className="sort-btn" onClick={() => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : -1 }))}>
        {label}
        {sort.key === key && <Icon name="chevronDown" size={12} className={sort.dir === 1 ? 'flip' : ''} />}
      </button>
    </th>
  );

  if (trades === null) return null;

  if (trades.length === 0) {
    return (
      <div className="journal">
        <JournalHead count={0} />
        <div className="panel empty-state">
          <span className="empty-state__icon">
            <Icon name="book" size={20} />
          </span>
          <h2 className="step-title">No trades yet</h2>
          <p className="step-sub">Import a trade journal from Notion and your trades will appear here.</p>
          <a className="btn btn--primary" href="#/imports">
            Import trades <Icon name="arrowRight" />
          </a>
        </div>
      </div>
    );
  }

  const optionalKeys = TRADE_FIELDS.filter((f) => !f.required && !['trade_notes', 'profit_loss_amount', 'management_style'].includes(f.key));
  const hasAmount = trades.some((t) => amountOf(t) !== null);
  const hasManagement = options.managements.length > 0;

  return (
    <div className="journal">
      <JournalHead count={trades.length} />

      <div className="metrics metrics--5">
        <Stat label={filtered ? 'Trades (filtered)' : 'Trades'} value={s.count} foot={`${s.wins}W · ${s.losses}L · ${s.breakeven} BE`} />
        <Stat
          label="Win rate"
          value={s.winRate === null ? '—' : `${(s.winRate * 100).toFixed(1)}%`}
          foot={
            <>
              Breakevens excluded
              {s.winRate !== null && (
                <div className="meter meter--split" aria-hidden="true">
                  <span style={{ width: `${s.winRate * 100}%` }} />
                </div>
              )}
            </>
          }
        />
        <Stat label="Net R" value={fmtR(s.netR)} tone={s.netR > 0 ? 'positive' : s.netR < 0 ? 'negative' : undefined} foot={`Avg ${fmtR(s.avgR)} per trade`} />
        <Stat
          label="Net P/L"
          value={fmtPct(s.netPl)}
          tone={s.netPl > 0 ? 'positive' : s.netPl < 0 ? 'negative' : undefined}
          foot={s.netAmount !== null ? `${fmtAmount(s.netAmount)} · avg risk ${fmtRisk(s.avgRisk)}` : `Avg risk ${fmtRisk(s.avgRisk)}`}
        />
        <Stat
          label="Profit factor"
          value={s.profitFactor === null ? '—' : s.profitFactor.toFixed(2)}
          foot={`Avg win ${fmtR(s.avgWinR)} · loss ${fmtR(s.avgLossR)}`}
        />
      </div>

      <section className="panel">
        <header className="panel__head panel__head--wrap">
          <div className="filters">
            <FilterSelect label="Pair" value={filters.pair} options={options.pairs} onChange={(pair) => setFilters({ ...filters, pair })} />
            <FilterSelect label="Setup" value={filters.setup} options={options.setups} onChange={(setup) => setFilters({ ...filters, setup })} />
            {options.managements.length > 0 && (
              <FilterSelect
                label="Management"
                value={filters.management}
                options={options.managements}
                onChange={(management) => setFilters({ ...filters, management })}
              />
            )}
            {options.accounts.length > 0 && (
              <FilterSelect label="Account" value={filters.account} options={options.accounts} onChange={(account) => setFilters({ ...filters, account })} />
            )}
            <FilterSelect
              label="Outcome"
              value={filters.outcome}
              options={['win', 'loss', 'breakeven']}
              labels={OUTCOME_LABEL}
              onChange={(outcome) => setFilters({ ...filters, outcome: outcome as Filters['outcome'] })}
            />
            {options.datasets.length > 1 && (
              <FilterSelect
                label="Journal"
                value={filters.dataset}
                options={options.datasets.map((d) => d.datasetId)}
                labels={Object.fromEntries(options.datasets.map((d) => [d.datasetId, d.datasetName]))}
                onChange={(dataset) => setFilters({ ...filters, dataset })}
              />
            )}
            {filtered && (
              <button className="btn btn--xs btn--ghost" onClick={() => setFilters(NO_FILTERS)}>
                <Icon name="x" size={12} /> Clear
              </button>
            )}
          </div>
          <span className="panel__aside muted">
            {visible.length} of {trades.length}
          </span>
        </header>

        <div className="table-wrap">
          <table className="preview-table journal-table">
            <thead>
              <tr>
                <th>
                  <button
                    className="sort-btn"
                    onClick={() => setSort((cur) => ({ key: 'trade_date', dir: cur.key === 'trade_date' ? (cur.dir === 1 ? -1 : 1) : -1 }))}
                  >
                    Date
                    {sort.key === 'trade_date' && <Icon name="chevronDown" size={12} className={sort.dir === 1 ? 'flip' : ''} />}
                  </button>
                </th>
                <th>Pair</th>
                <th>Side</th>
                <th>Setup</th>
                {hasManagement && <th>Management</th>}
                <th>Session</th>
                {header('risk_percentage', 'Risk')}
                {header('result_r', 'Result')}
                {header('profit_loss_percentage', 'P/L %')}
                {hasAmount && <th className="num">P/L</th>}
                <th>Outcome</th>
                <th aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const open = expanded === t.id;
                const outcome = outcomeOf(t);
                const direction = optionalText(t, 'direction');
                const notes = optionalText(t, 'trade_notes');
                return (
                  <Fragment key={t.id}>
                    <tr className={`row ${open ? 'is-open' : ''}`} onClick={() => setExpanded(open ? null : t.id)}>
                      <td>{fmtDate(t.trade_date)}</td>
                      <td className="strong">{t.currency_pair}</td>
                      <td>{direction ? <span className={`side side--${direction}`}>{direction === 'long' ? 'Long' : direction === 'short' ? 'Short' : direction}</span> : <span className="muted">—</span>}</td>
                      <td>{t.setup}</td>
                      {hasManagement && <td>{optionalText(t, 'management_style') ?? <span className="muted">—</span>}</td>}
                      <td>{optionalText(t, 'trading_session') ?? <span className="muted">—</span>}</td>
                      <td className="num">{fmtRisk(t.risk_percentage)}</td>
                      <td className={`num ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</td>
                      <td className={`num ${signTone(t.profit_loss_percentage)}`}>{fmtPct(t.profit_loss_percentage)}</td>
                      {hasAmount && <td className={`num ${signTone(amountOf(t))}`}>{fmtAmount(amountOf(t))}</td>}
                      <td>
                        <Badge tone={OUTCOME_TONE[outcome]}>{OUTCOME_LABEL[outcome]}</Badge>
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-expanded={open}
                          aria-label="Show trade details"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(open ? null : t.id);
                          }}
                        >
                          <Icon name={open ? 'chevronDown' : 'chevronRight'} />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="detail-row">
                        <td colSpan={10 + Number(hasAmount) + Number(hasManagement)}>
                          <div className="trade-detail">
                            <div>
                              <div className="eyebrow">Notes</div>
                              <p className={notes ? '' : 'muted'}>{notes ?? 'No notes for this trade.'}</p>
                              {t.source.recordUrl && (
                                <a className="link" href={t.source.recordUrl} target="_blank" rel="noreferrer">
                                  Open in Notion <Icon name="external" size={12} />
                                </a>
                              )}
                            </div>
                            <dl className="trade-detail__fields">
                              {optionalKeys.map((f) => {
                                const v = formatOptional(t.optional[f.key], f.key);
                                return (
                                  <div key={f.key}>
                                    <dt className="eyebrow">{f.label}</dt>
                                    <dd className={v ? '' : 'muted'}>{v ?? '—'}</dd>
                                  </div>
                                );
                              })}
                              <div>
                                <dt className="eyebrow">Source</dt>
                                <dd>{t.source.datasetName}</dd>
                              </div>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <p className="empty">No trades match these filters.</p>}
      </section>

      <section className="panel">
        <header className="panel__head">
          <h3 className="section-title">Imported from</h3>
          <a className="btn btn--xs" href="#/imports">
            <Icon name="refresh" size={12} /> Re-import / add journal
          </a>
        </header>
        <ul className="source-list">
          {options.datasets.map((d) => {
            const n = trades.filter((t) => t.source.datasetId === d.datasetId).length;
            const last = trades
              .filter((t) => t.source.datasetId === d.datasetId)
              .reduce((a, t) => (t.source.importedAt > a ? t.source.importedAt : a), '');
            return (
              <li key={d.datasetId}>
                <span className="source-mark source-mark--sm" aria-hidden="true">
                  N
                </span>
                <div className="source-list__main">
                  <strong>{d.datasetName}</strong>
                  <span className="muted">
                    {n} trades · last imported {last ? new Date(last).toLocaleString() : '—'}
                  </span>
                </div>
                <button className="btn btn--xs btn--ghost" onClick={() => void removeDataset(d.datasetId, d.datasetName, n)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function JournalHead({ count }: { count: number }) {
  return <PageHeader title="Journal" meta={count > 0 ? count : undefined} description="Every trade you've taken, standardised from your Notion journal." />;
}
