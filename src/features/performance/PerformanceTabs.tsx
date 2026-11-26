import { PageHeader } from '../../ui/PageHeader';

export type PerformanceSub = 'overview' | 'setup' | 'timeframe' | 'tags' | 'edge';

const TABS = [
  { key: 'overview', label: 'Overview', href: '#/performance' },
  { key: 'setup', label: 'Setup', href: '#/performance/setup' },
  { key: 'timeframe', label: 'Timeframe', href: '#/performance/timeframe' },
  { key: 'tags', label: 'Tags', href: '#/performance/tags' },
  { key: 'edge', label: 'Edge', href: '#/performance/edge' },
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
