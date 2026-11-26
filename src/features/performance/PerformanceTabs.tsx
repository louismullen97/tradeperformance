import { PageHeader } from '../../ui/PageHeader';

export type PerformanceSub = 'overview' | 'setup' | 'timeframe';

const TABS = [
  { key: 'overview', label: 'Overview', href: '#/performance' },
  { key: 'setup', label: 'Setup', href: '#/performance/setup' },
  { key: 'timeframe', label: 'Timeframe', href: '#/performance/timeframe' },
];

export function PerformanceTabs({ active }: { active: PerformanceSub }) {
  return (
    <PageHeader
      title="Performance"
      description="How your trades perform across setups, timeframes and conditions."
      tabs={TABS}
      activeTab={active}
    />
  );
}
