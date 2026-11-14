import { NavLink } from 'react-router-dom';

export interface TabDef {
  id: string;
  label: string;
  count?: number | null;
  hot?: boolean;
}

/** Route-driven tabs (/desk/:tab, /admin/:tab). */
export function Tabs({ base, tabs, active }: { base: string; tabs: TabDef[]; active: string }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <NavLink key={t.id} to={`${base}/${t.id}`} className="tab-link" aria-current={active === t.id ? 'page' : undefined}>
          {t.label}
          {t.count != null && <span className={`count${t.hot && t.count > 0 ? ' hot' : ''}`}>{t.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
