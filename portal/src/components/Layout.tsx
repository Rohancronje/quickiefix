import React, { type ComponentType, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  IconActivity,
  IconBilling,
  IconBriefcase,
  IconClock,
  IconCompanies,
  IconComplaint,
  IconLogout,
  IconMetrics,
  IconOverview,
  IconTradies,
} from '../backoffice/icons';

type SvgIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const NAV: { path: string; label: string; Icon: SvgIcon }[] = [
  { path: '/', label: 'Dashboard', Icon: IconOverview },
  { path: '/jobs', label: 'Jobs', Icon: IconActivity },
  { path: '/team', label: 'My Tradies', Icon: IconTradies },
  { path: '/timesheets', label: 'Timesheets', Icon: IconClock },
  { path: '/reputation', label: 'Reputation', Icon: IconMetrics },
  { path: '/billing', label: 'Billing', Icon: IconBilling },
  { path: '/agents', label: 'Property agents', Icon: IconCompanies },
  { path: '/support', label: 'Support', Icon: IconComplaint },
  { path: '/settings', label: 'Settings', Icon: IconBriefcase },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/jobs': 'Job board',
  '/team': 'My Tradies',
  '/timesheets': 'Timesheets',
  '/reputation': 'Reputation',
  '/billing': 'Billing & ROI',
  '/agents': 'Property agents',
  '/support': 'Support',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { company, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const title =
    loc.pathname === '/'
      ? `Welcome back, ${company?.name ?? ''} 👋`
      : (TITLES[loc.pathname] ?? (loc.pathname.startsWith('/tradie') ? 'Tradie' : 'QuickieFix'));
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="co-shell">
      <aside className="co-sidebar">
        <div className="co-brand">
          <img
            src="/logo-lockup-reversed.svg"
            alt="QuickieFix"
            style={{ height: 30, width: 'auto', display: 'block' }}
          />
        </div>

        <nav className="co-nav">
          {NAV.map((n) => {
            const active = n.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.path);
            return (
              <div
                key={n.path}
                className={`co-navitem${active ? ' active' : ''}`}
                onClick={() => nav(n.path)}
              >
                <span className="co-ico">
                  <n.Icon size={18} />
                </span>
                <span className="co-navtext">{n.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="co-sidefoot">
          <div className="co-idcard">
            <div className="co-id-row">
              <span className="co-id-icon">
                <IconCompanies size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="co-id-name">{company?.name}</div>
                <div className="co-id-mail">{company?.adminEmail}</div>
              </div>
            </div>
            <button className="co-logout" onClick={logout}>
              <IconLogout size={16} />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="co-main">
        <header className="co-header">
          <h1 className="co-title">{title}</h1>
          <span className="co-date">{today}</span>
        </header>
        <div className="co-content">
          <div className="co-content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
