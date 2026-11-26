import type { ReactNode } from 'react';
import type { MappingStatus } from '../domain/mapping/types';
import type { RecordStatus } from '../domain/validation/types';

// ── Icons (inline, stroke-based, 16px grid) ────────────────────────────────
const PATHS = {
  check: 'M3.5 8.5l3 3 6-7',
  alert: 'M8 5v3.5M8 11h.01M7.1 2.6L1.8 12a1 1 0 00.9 1.5h10.6a1 1 0 00.9-1.5L8.9 2.6a1 1 0 00-1.8 0z',
  x: 'M4 4l8 8M12 4l-8 8',
  minus: 'M4 8h8',
  arrowRight: 'M3 8h10M9 4l4 4-4 4',
  arrowLeft: 'M13 8H3M7 4L3 8l4 4',
  chevronDown: 'M4 6l4 4 4-4',
  chevronRight: 'M6 4l4 4-4 4',
  sparkle: 'M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.5 1.5M10.5 10.5L12 12M12 4l-1.5 1.5M5.5 10.5L4 12',
  refresh: 'M13 3v3.5H9.5M3 13V9.5h3.5M12.3 6.5A5 5 0 003.8 5M3.7 9.5a5 5 0 008.5 1.5',
  database: 'M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2zM2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1',
  external: 'M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5',
  info: 'M8 7v4M8 5h.01M14 8A6 6 0 112 8a6 6 0 0112 0z',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  chart: 'M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V8.5',
  book: 'M3 2.5h7.5a2 2 0 012 2v9H5a2 2 0 01-2-2zM3 11.5a2 2 0 012-2h7.5',
  upload: 'M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM13 8a5 5 0 00-.1-1l1.4-1.1-1.4-2.4-1.7.6a5 5 0 00-1.7-1L9.2 1.5H6.8l-.3 1.6a5 5 0 00-1.7 1l-1.7-.6L1.7 5.9 3.1 7a5 5 0 000 2l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 001.7 1l.3 1.6h2.4l.3-1.6a5 5 0 001.7-1l1.7.6 1.4-2.4L12.9 9c.1-.3.1-.7.1-1z',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  layers: 'M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
  search: 'M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────
type Tone = 'positive' | 'warning' | 'negative' | 'neutral' | 'info' | 'accent';

export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: IconName }) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

const MAPPING_STATUS: Record<MappingStatus, { label: string; tone: Tone; icon: IconName }> = {
  auto_matched: { label: 'Auto-matched', tone: 'positive', icon: 'sparkle' },
  restored: { label: 'Saved mapping', tone: 'positive', icon: 'check' },
  manual: { label: 'Set manually', tone: 'info', icon: 'check' },
  uncertain: { label: 'Review', tone: 'warning', icon: 'alert' },
  missing: { label: 'Missing', tone: 'negative', icon: 'x' },
  unmapped: { label: 'Not mapped', tone: 'neutral', icon: 'minus' },
  conflict: { label: 'Conflict', tone: 'negative', icon: 'alert' },
  incompatible: { label: 'Incompatible', tone: 'negative', icon: 'x' },
  stale: { label: 'Property removed', tone: 'negative', icon: 'alert' },
};

export function MappingStatusBadge({ status }: { status: MappingStatus }) {
  const s = MAPPING_STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

const RECORD_STATUS: Record<RecordStatus, { label: string; tone: Tone; icon: IconName }> = {
  valid: { label: 'Valid', tone: 'positive', icon: 'check' },
  attention: { label: 'Review', tone: 'warning', icon: 'alert' },
  excluded: { label: 'Excluded', tone: 'negative', icon: 'x' },
};

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  const s = RECORD_STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────
export function Panel({
  title,
  aside,
  children,
  className = '',
  flush,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || aside) && (
        <header className="panel__head">
          {title && <h3 className="eyebrow">{title}</h3>}
          {aside && <div className="panel__aside">{aside}</div>}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
  foot,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  foot?: ReactNode;
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="stat__value">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </div>
      {foot && <div className="stat__foot">{foot}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

// ── Formatting ───────────────────────────────────────────────────────────
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function fmtPct(n: unknown) {
  return typeof n === 'number' ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
}

export function fmtRisk(n: unknown) {
  return typeof n === 'number' ? `${n.toFixed(2)}%` : '—';
}

export function fmtR(n: unknown) {
  return typeof n === 'number' ? `${n > 0 ? '+' : ''}${n.toFixed(2)}R` : '—';
}

const amountFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
/** Money amount in account currency (no symbol — the currency isn't known). */
export function fmtAmount(n: number | null | undefined) {
  return typeof n === 'number' ? `${n > 0 ? '+' : ''}${amountFmt.format(n)}` : '—';
}

export function fmtWinRate(n: number | null | undefined) {
  return typeof n === 'number' ? `${(n * 100).toFixed(0)}%` : '—';
}

export function signTone(n: unknown): string {
  if (typeof n !== 'number' || n === 0) return '';
  return n > 0 ? 'num--pos' : 'num--neg';
}

export function relativeTime(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.round(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
