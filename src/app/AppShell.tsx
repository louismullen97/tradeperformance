import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/primitives';

export type View = 'overview' | 'journal' | 'performance' | 'review' | 'psychology' | 'missed' | 'imports';

const NAV: { section: string; items: { label: string; icon: IconName; view?: View }[] }[] = [
  {
    section: 'Trading',
    items: [
      { label: 'Dashboard', icon: 'grid', view: 'overview' },
      { label: 'Journal', icon: 'book', view: 'journal' },
      { label: 'Performance', icon: 'chart', view: 'performance' },
      { label: 'Review Centre', icon: 'refresh', view: 'review' },
    ],
  },
  {
    section: 'Behaviour',
    items: [
      { label: 'Psychology', icon: 'layers', view: 'psychology' },
      { label: 'Missed trades', icon: 'search', view: 'missed' },
    ],
  },
  {
    section: 'Data',
    items: [
      { label: 'Imports', icon: 'upload', view: 'imports' },
      { label: 'Data sources', icon: 'database' },
    ],
  },
];

const CRUMBS: Record<View, string[]> = {
  overview: ['Dashboard'],
  journal: ['Trading', 'Journal'],
  performance: ['Trading', 'Performance'],
  review: ['Trading', 'Review Centre'],
  psychology: ['Behaviour', 'Psychology'],
  missed: ['Behaviour', 'Missed trades'],
  imports: ['Data', 'Imports'],
};

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="20" height="20" rx="6" fill="currentColor" opacity="0.12" />
      <path d="M5.5 14.5l3.5-4 3 2.5 4.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface ConnectionInfo {
  live: boolean;
  title: string;
  subtitle: string;
}

export function AppShell({ children, connection, view, sub }: { children: ReactNode; connection: ConnectionInfo; view: View; sub?: string }) {
  const [open, setOpen] = useState(false);
  const crumbs = sub ? [...CRUMBS[view], sub] : CRUMBS[view];

  return (
    <div className={`shell ${open ? 'is-nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <a className="sidebar__brand" href="#/overview">
          <Logo />
          <span>Tradelens</span>
        </a>
        <nav className="sidebar__nav">
          {NAV.map((group) => (
            <div key={group.section} className="sidebar__group">
              <div className="sidebar__section">{group.section}</div>
              {group.items.map((item) => {
                const active = item.view === view;
                return (
                  <a
                    key={item.label}
                    href={item.view ? `#/${item.view}` : '#'}
                    onClick={(e) => {
                      if (!item.view) e.preventDefault();
                      setOpen(false);
                    }}
                    className={`sidebar__link ${active ? 'is-active' : ''} ${item.view ? '' : 'is-disabled'}`}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={!item.view}
                    title={item.view ? undefined : 'Coming soon'}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {!item.view && <span className="sidebar__soon">Soon</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__conn">
            <span className={`status-dot ${connection.live ? 'status-dot--live' : 'status-dot--idle'}`} />
            <div className="sidebar__conn-text">
              <div className="sidebar__conn-title">{connection.title}</div>
              <div className="sidebar__conn-sub">{connection.subtitle}</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar__menu" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className={`crumbs__item ${i === crumbs.length - 1 ? 'is-current' : ''}`} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                {c}
              </span>
            ))}
          </nav>
          <div className="topbar__right">
            <span className={`env-pill ${connection.live ? 'env-pill--live' : ''}`}>
              <span className={`status-dot ${connection.live ? 'status-dot--live' : 'status-dot--idle'}`} /> {connection.live ? 'Live' : 'Demo data'}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
