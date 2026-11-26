import { PageHeader } from '../../ui/PageHeader';

const TABS = [
  { key: 'overview', label: 'Overview', href: '#/psychology' },
  { key: 'flow', label: 'Flow Zone', href: '#/psychology/flow' },
];

export function PsychologyTabs({ active, description }: { active: 'overview' | 'flow'; description: string }) {
  return <PageHeader title="Psychology" description={description} tabs={TABS} activeTab={active} />;
}
