import { useEffect, useState } from 'react';
import {
  isTradie,
  listAllJobs,
  listAllUsers,
  listCompanies,
  listComplaints,
  resolveComplaint,
  setApproval,
} from '../adminApi';
import { useAuth } from '../auth';
import { formatDate, formatDuration, initials, stars } from '../lib';
import { Company, Complaint, Customer, Job, Tradie, tradeLabel } from '../types';

type Tab = 'overview' | 'tradies' | 'jobs' | 'customers' | 'complaints';

const NAV: { key: Tab; label: string; ico: string }[] = [
  { key: 'overview', label: 'Overview', ico: '📊' },
  { key: 'tradies', label: 'Tradies', ico: '🧰' },
  { key: 'jobs', label: 'Jobs', ico: '📋' },
  { key: 'customers', label: 'Customers', ico: '👥' },
  { key: 'complaints', label: 'Complaints', ico: '⚠️' },
];

export function BackOffice() {
  const { adminEmail, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<(Tradie | Customer)[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [u, j, c, co] = await Promise.all([
      listAllUsers(),
      listAllJobs(),
      listComplaints(),
      listCompanies(),
    ]);
    setUsers(u);
    setJobs(j);
    setComplaints(c);
    setCompanies(co);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const tradies = users.filter(isTradie) as Tradie[];
  const customers = users.filter((u) => u.role === 'customer') as Customer[];
  const openComplaints = complaints.filter((c) => c.status === 'open');

  const approve = async (t: Tradie, approval: Tradie['approval']) => {
    await setApproval(t.id, approval);
    await load();
  };
  const resolve = async (c: Complaint) => {
    await resolveComplaint(c.id);
    await load();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row">
          <img src="/logo.png" alt="QuickieFix" style={{ height: 40, background: '#fff', borderRadius: 8, padding: 4 }} />
          <div className="brand-sub" style={{ marginLeft: 2 }}>Back Office</div>
        </div>
        {NAV.map((n) => (
          <div
            key={n.key}
            className={`nav-item${tab === n.key ? ' active' : ''}`}
            onClick={() => setTab(n.key)}
          >
            <span className="ico">{n.ico}</span>
            {n.label}
            {n.key === 'complaints' && openComplaints.length > 0 && (
              <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>
                {openComplaints.length}
              </span>
            )}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="company-chip">
            <div className="cname">🛡️ Platform Admin</div>
            <div className="cmail">{adminEmail}</div>
          </div>
          <div className="nav-item" onClick={logout}>
            <span className="ico">↩︎</span>Log out
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <h1>{NAV.find((n) => n.key === tab)?.label}</h1>
        </div>
        <div className="content" style={{ maxWidth: 1200 }}>
          {loading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
              <div className="spinner" />
            </div>
          ) : tab === 'overview' ? (
            <Overview
              tradies={tradies}
              customers={customers}
              jobs={jobs}
              companies={companies}
              openComplaints={openComplaints.length}
            />
          ) : tab === 'tradies' ? (
            <Tradies tradies={tradies} onApprove={approve} />
          ) : tab === 'jobs' ? (
            <Jobs jobs={jobs} />
          ) : tab === 'customers' ? (
            <Customers customers={customers} jobs={jobs} />
          ) : (
            <Complaints complaints={complaints} onResolve={resolve} />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Overview -- */

function Overview({
  tradies,
  customers,
  jobs,
  companies,
  openComplaints,
}: {
  tradies: Tradie[];
  customers: Customer[];
  jobs: Job[];
  companies: Company[];
  openComplaints: number;
}) {
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const active = jobs.filter((j) =>
    ['searching', 'accepted', 'travelling', 'on_site'].includes(j.status),
  ).length;
  const pending = tradies.filter((t) => t.approval === 'pending').length;

  const cards = [
    { v: customers.length, l: 'Customers' },
    { v: tradies.length, l: 'Tradies' },
    { v: companies.length, l: 'Companies' },
    { v: jobs.length, l: 'Total jobs' },
    { v: completed, l: 'Completed' },
    { v: active, l: 'Active now' },
    { v: pending, l: 'Pending approval' },
    { v: openComplaints, l: 'Open complaints' },
  ];

  return (
    <div className="grid stat-grid">
      {cards.map((c) => (
        <div className="stat" key={c.l}>
          <div className="v">{c.v}</div>
          <div className="l">{c.l}</div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Tradies -- */

function ApprovalBadge({ a }: { a: Tradie['approval'] }) {
  const map: Record<string, string> = {
    approved: 'badge-green',
    pending: 'badge-amber',
    rejected: 'badge-gray',
    suspended: 'badge-gray',
  };
  return <span className={`badge ${map[a]}`}>{a}</span>;
}

function Tradies({
  tradies,
  onApprove,
}: {
  tradies: Tradie[];
  onApprove: (t: Tradie, a: Tradie['approval']) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const list = tradies.filter((t) => (filter === 'all' ? true : t.approval === filter));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex" style={{ gap: 8 }}>
        {(['all', 'pending', 'approved'] as const).map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <div className="empty">
            <div className="e-ico">🧰</div>
            <p>No tradies.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tradie</th>
                <th>Trade</th>
                <th>Company</th>
                <th>Rating</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="flex">
                      <div className="avatar">{initials(t.firstName, t.lastName)}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {t.firstName} {t.lastName}
                        </div>
                        <div className="faint" style={{ fontSize: 12 }}>
                          {t.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{tradeLabel(t.primaryTrade)}</td>
                  <td className="faint">{t.companyName ?? '—'}</td>
                  <td>
                    {t.ratingCount ? (
                      <span className="stars">{stars(t.ratingAvg)}</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <ApprovalBadge a={t.approval} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {t.approval !== 'approved' && (
                      <button className="btn btn-primary btn-sm" onClick={() => onApprove(t, 'approved')}>
                        Approve
                      </button>
                    )}{' '}
                    {t.approval === 'approved' ? (
                      <button className="btn btn-danger btn-sm" onClick={() => onApprove(t, 'suspended')}>
                        Suspend
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => onApprove(t, 'rejected')}>
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Jobs -- */

const STATUS_BADGE: Record<string, string> = {
  completed: 'badge-green',
  searching: 'badge-amber',
  accepted: 'badge-blue',
  travelling: 'badge-blue',
  on_site: 'badge-blue',
  cancelled: 'badge-gray',
  disputed: 'badge-gray',
};

function Jobs({ jobs }: { jobs: Job[] }) {
  const [filter, setFilter] = useState<string>('all');
  const statuses = ['all', 'completed', 'searching', 'cancelled'];
  const list = jobs.filter((j) => (filter === 'all' ? true : j.status === filter));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex" style={{ gap: 8 }}>
        {statuses.map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <div className="empty">
            <div className="e-ico">📋</div>
            <p>No jobs.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Trade</th>
                <th>Customer</th>
                <th>Tradie</th>
                <th>Created</th>
                <th>On site</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 600 }}>{tradeLabel(j.trade)}</td>
                  <td>{j.customerName}</td>
                  <td className="faint">{j.tradieName ?? '—'}</td>
                  <td>{formatDate(j.timestamps.createdAt)}</td>
                  <td>
                    {formatDuration(
                      j.timestamps.completedAt && j.timestamps.onSiteAt
                        ? j.timestamps.completedAt - j.timestamps.onSiteAt
                        : undefined,
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[j.status] ?? 'badge-gray'}`}>
                      {j.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Customers -- */

function Customers({ customers, jobs }: { customers: Customer[]; jobs: Job[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {customers.length === 0 ? (
        <div className="empty">
          <div className="e-ico">👥</div>
          <p>No customers.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Jobs requested</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const count = jobs.filter((j) => j.customerId === c.id).length;
              return (
                <tr key={c.id}>
                  <td>
                    <div className="flex">
                      <div className="avatar" style={{ background: 'var(--blue)' }}>
                        {initials(c.firstName, c.lastName)}
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        {c.firstName} {c.lastName}
                      </div>
                    </div>
                  </td>
                  <td className="faint">{c.email}</td>
                  <td style={{ fontWeight: 700 }}>{count}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Complaints -- */

function Complaints({
  complaints,
  onResolve,
}: {
  complaints: Complaint[];
  onResolve: (c: Complaint) => void;
}) {
  if (complaints.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="e-ico">✅</div>
          <p style={{ fontWeight: 700, color: 'var(--text)' }}>No complaints</p>
          <p>All clear — customers are happy.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid" style={{ gap: 14 }}>
      {complaints.map((c) => (
        <div key={c.id} className="card">
          <div className="between" style={{ marginBottom: 8 }}>
            <div className="flex" style={{ gap: 10 }}>
              <strong>{c.subject}</strong>
              <span className={`badge ${c.status === 'open' ? 'badge-amber' : 'badge-green'}`}>
                {c.status}
              </span>
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              {formatDate(c.createdAt)}
            </span>
          </div>
          {c.detail && <p style={{ fontSize: 14, marginBottom: 10 }}>{c.detail}</p>}
          <div className="between">
            <span className="faint" style={{ fontSize: 13 }}>
              {tradeLabel(c.trade)} · {c.customerName}
              {c.tradieName ? ` → ${c.tradieName}` : ''}
            </span>
            {c.status === 'open' && (
              <button className="btn btn-primary btn-sm" onClick={() => onResolve(c)}>
                Mark resolved
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
