import type { ReactNode } from 'react';

export interface PageTab {
  key: string;
  label: string;
  href: string;
  badge?: string;
}

/**
 * Standard page header: title, optional description and actions, and an
 * optional row of underline tabs for sub-pages. Used by every page so titles,
 * spacing and sub-navigation are identical across the app.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  tabs,
  activeTab,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Small muted figure next to the title, e.g. a count. */
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: PageTab[];
  activeTab?: string;
}) {
  return (
    <header className="page-header">
      <div className="page-header__row">
        <div className="page-header__text">
          <h1 className="page-title">
            {title}
            {meta !== undefined && meta !== null && <span className="page-title__meta">{meta}</span>}
          </h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
      {tabs && (
        <nav className="subnav" aria-label="Sections">
          {tabs.map((t) => (
            <a key={t.key} href={t.href} className={`subnav__item ${activeTab === t.key ? 'is-active' : ''}`} aria-current={activeTab === t.key ? 'page' : undefined}>
              {t.label}
              {t.badge && <span className="subnav__badge">{t.badge}</span>}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
