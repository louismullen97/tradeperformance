import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/primitives';

const NAV: { section: string; items: { label: string; icon: IconName; active?: boolean }[] }[] = [
  {
    section: 'Analyse',
    items: [
      { label: 'Overview', icon: 'grid' },
      { label: 'Journal', icon: 'book' },
      { label: 'Analytics', icon: 'chart' },
    ],
  },
  {
    section: 'Data',
    items: [
      { label: 'Imports', icon: 'upload', active: true },
      { label: 'Data sources', icon: 'database' },
    ],
  },
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 14.5l3.5-4 3 2.5L17 7" fill="none" stroke="var(--brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppShell({ children, connectionLabel }: { children: ReactNode; connectionLabel: string }) {
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
              {group.items.map((item) => (
                <a
                  key={item.label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className={`sidebar__link ${item.active ? 'is-active' : ''}`}
                  aria-current={item.active ? 'page' : undefined}
                  aria-disabled={!item.active}
                  title={item.active ? undefined : 'Coming soon'}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__conn">
            <span className="pulse" />
            <div>
              <div className="sidebar__conn-title">{connectionLabel}</div>
              <div className="sidebar__conn-sub">Mock data · no live API</div>
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
            <span>Data</span>
            <Icon name="chevronRight" size={12} />
            <span>Imports</span>
            <Icon name="chevronRight" size={12} />
            <strong>Notion</strong>
          </nav>
          <div className="topbar__right">
            <span className="env-pill">
              <span className="dot dot--positive" /> Sandbox
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
