import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = [
  { path: '/', label: 'Dashboard', ico: '📊' },
  { path: '/team', label: 'My Tradies', ico: '🧰' },
  { path: '/settings', label: 'Settings', ico: '⚙️' },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/team': 'My Tradies',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { company, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? (loc.pathname.startsWith('/tradie') ? 'Tradie' : 'QuickieFix');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">⚡</div>
          <div>
            <div className="brand-name">
              Quickie<span>Fix</span>
            </div>
            <div className="brand-sub">Business Portal</div>
          </div>
        </div>

        {NAV.map((n) => {
          const active = n.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.path);
          return (
            <div
              key={n.path}
              className={`nav-item${active ? ' active' : ''}`}
              onClick={() => nav(n.path)}
            >
              <span className="ico">{n.ico}</span>
              {n.label}
            </div>
          );
        })}

        <div className="sidebar-foot">
          <div className="company-chip">
            <div className="cname">🏢 {company?.name}</div>
            <div className="cmail">{company?.adminEmail}</div>
          </div>
          <div className="nav-item" onClick={logout}>
            <span className="ico">↩︎</span>
            Log out
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
