import { Icon } from '../../ui/primitives';

export type PerformanceSub = 'overview' | 'setup' | 'timeframe';

const TABS: { key: PerformanceSub; label: string; href: string }[] = [
  { key: 'overview', label: 'Overview', href: '#/performance' },
  { key: 'setup', label: 'Setup', href: '#/performance/setup' },
  { key: 'timeframe', label: 'Timeframe', href: '#/performance/timeframe' },
];

export function PerformanceTabs({ active }: { active: PerformanceSub }) {
  return (
    <header className="wizard__head">
      <div className="wizard__title">
        <span className="source-mark" aria-hidden="true">
          <Icon name="chart" size={18} />
        </span>
        <div>
          <div className="eyebrow">Performance · {TABS.find((t) => t.key === active)?.label}</div>
          <h1>Performance</h1>
        </div>
      </div>
      <nav className="tabs" aria-label="Performance sections">
        {TABS.map((t) => (
          <a key={t.key} href={t.href} className={`tab ${active === t.key ? 'is-active' : ''}`} aria-current={active === t.key ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
