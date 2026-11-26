import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/primitives';

export type View = 'overview' | 'journal' | 'analysis' | 'imports';

const NAV: { section: string; items: { label: string; icon: IconName; view?: View }[] }[] = [
  {
    section: 'Analyse',
    items: [
      { label: 'Overview', icon: 'grid', view: 'overview' },
      { label: 'Journal', icon: 'book', view: 'journal' },
      { label: 'Analysis', icon: 'chart', view: 'analysis' },
      { label: 'Missed trades', icon: 'search' },
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
  overview: ['Analyse', 'Overview'],
  journal: ['Analyse', 'Journal'],
  analysis: ['Analyse', 'Analysis'],
  imports: ['Data', 'Imports', 'Notion'],
};

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 14.5l3.5-4 3 2.5L17 7" fill="none" stroke="var(--brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface ConnectionInfo {
  live: boolean;
  title: string;
  subtitle: string;
}

export function AppShell({ children, connection, view }: { children: ReactNode; connection: ConnectionInfo; view: View }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`shell ${open ? 'is-nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <Logo />
          <span>Tradelens</span>
        </div>
        <nav>
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
                    className={`sidebar__link ${active ? 'is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={!item.view}
                    title={item.view ? undefined : 'Coming soon'}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    {!item.view && <span className="soon">Soon</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__conn">
            <span className={connection.live ? 'pulse' : 'pulse pulse--idle'} />
            <div>
              <div className="sidebar__conn-title">{connection.title}</div>
              <div className="sidebar__conn-sub">{connection.subtitle}</div>
            </div>
          </div>
          <a href="#" onClick={(e) => e.preventDefault()} className="sidebar__link" aria-disabled title="Coming soon">
            <Icon name="settings" /> Settings
          </a>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar__menu" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {CRUMBS[view].map((c, i, all) => (
              <span key={c} className="crumbs__item">
                {i === all.length - 1 ? <strong>{c}</strong> : c}
                {i < all.length - 1 && <Icon name="chevronRight" size={12} />}
              </span>
            ))}
          </nav>
          <div className="topbar__right">
            <span className="env-pill">
              <span className={`dot ${connection.live ? 'dot--positive' : 'dot--warning'}`} /> {connection.live ? 'Live' : 'Demo'}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
