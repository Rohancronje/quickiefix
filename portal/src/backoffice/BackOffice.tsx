import { useEffect, useState } from 'react';
import {
  isTradie,
  listAllJobs,
  listAllUsers,
  listCompanies,
  listComplaints,
  listFeeLineItems,
  listPendingTags,
  resolveComplaint,
  setApproval,
  setFreeCredits,
  setPaymentHold,
  setSharedCredits,
  validateTag,
} from '../adminApi';
import { useAuth } from '../auth';
import { centsToDollars, formatDate, formatDuration, initials, stars } from '../lib';
import {
  Company,
  CompanyTag,
  Complaint,
  Customer,
  FeeLineItem,
  Job,
  Tradie,
  tradeLabel,
} from '../types';

type Tab =
  | 'overview'
  | 'tradies'
  | 'tags'
  | 'companies'
  | 'jobs'
  | 'customers'
  | 'billing'
  | 'complaints';

const NAV: { key: Tab; label: string; ico: string }[] = [
  { key: 'overview', label: 'Overview', ico: '📊' },
  { key: 'tradies', label: 'Tradies', ico: '🧰' },
  { key: 'tags', label: 'Tag queue', ico: '🏷️' },
  { key: 'companies', label: 'Companies', ico: '🏢' },
  { key: 'jobs', label: 'Jobs', ico: '📋' },
  { key: 'customers', label: 'Customers', ico: '👥' },
  { key: 'billing', label: 'Billing', ico: '💳' },
  { key: 'complaints', label: 'Complaints', ico: '⚠️' },
];

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function BackOffice() {
  const { adminEmail, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<(Tradie | Customer)[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fees, setFees] = useState<FeeLineItem[]>([]);
  const [pendingTags, setPendingTags] = useState<CompanyTag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [u, j, c, co, f, pt] = await Promise.all([
      listAllUsers(),
      listAllJobs(),
      listComplaints(),
      listCompanies(),
      listFeeLineItems(),
      listPendingTags(),
    ]);
    setUsers(u);
    setJobs(j);
    setComplaints(c);
    setCompanies(co);
    setFees(f);
    setPendingTags(pt);
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
  const toggleHold = async (t: Tradie) => {
    await setPaymentHold(t.id, !t.paymentHold);
    await load();
  };
  const updateCredits = async (t: Tradie, credits: number) => {
    await setFreeCredits(t.id, credits);
    await load();
  };
  const approveTag = async (tag: CompanyTag) => {
    await validateTag(tag.id);
    await load();
  };
  const updateSharedCredits = async (c: Company, n: number) => {
    await setSharedCredits(c.id, n);
    await load();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <img src="/logo.png" alt="QuickieFix" style={{ height: 56, width: '100%', objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 6 }} />
          <div className="brand-sub" style={{ textAlign: 'center' }}>Back Office</div>
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
            {n.key === 'tags' && pendingTags.length > 0 && (
              <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>
                {pendingTags.length}
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
            <Tradies
              tradies={tradies}
              onApprove={approve}
              onToggleHold={toggleHold}
              onUpdateCredits={updateCredits}
            />
          ) : tab === 'tags' ? (
            <TagQueue tags={pendingTags} users={users} onValidate={approveTag} />
          ) : tab === 'companies' ? (
            <Companies companies={companies} onUpdateCredits={updateSharedCredits} />
          ) : tab === 'jobs' ? (
            <Jobs jobs={jobs} />
          ) : tab === 'customers' ? (
            <Customers customers={customers} jobs={jobs} />
          ) : tab === 'billing' ? (
            <Billing fees={fees} />
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
    ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'].includes(j.status),
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
  onToggleHold,
  onUpdateCredits,
}: {
  tradies: Tradie[];
  onApprove: (t: Tradie, a: Tradie['approval']) => void;
  onToggleHold: (t: Tradie) => void;
  onUpdateCredits: (t: Tradie, credits: number) => void;
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
                <th>Credits</th>
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
                    <CreditControl tradie={t} onUpdate={onUpdateCredits} />
                  </td>
                  <td>
                    <ApprovalBadge a={t.approval} />
                    {t.paymentHold && (
                      <span className="badge badge-gray" style={{ marginLeft: 6 }}>
                        on hold
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {t.approval !== 'approved' && (
                      <button className="btn btn-primary btn-sm" onClick={() => onApprove(t, 'approved')}>
                        Approve
                      </button>
                    )}{' '}
                    <button
                      className={`btn btn-sm ${t.paymentHold ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => onToggleHold(t)}
                      title="Pause/reinstate dispatch for non-payment"
                    >
                      {t.paymentHold ? 'Reinstate' : 'Hold'}
                    </button>{' '}
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

function CreditControl({
  tradie,
  onUpdate,
}: {
  tradie: Tradie;
  onUpdate: (t: Tradie, credits: number) => void;
}) {
  const [val, setVal] = useState(String(tradie.freeJobCredits ?? 0));
  const dirty = val !== String(tradie.freeJobCredits ?? 0);
  return (
    <div className="flex" style={{ gap: 6 }}>
      <input
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)' }}
      />
      {dirty && (
        <button className="btn btn-primary btn-sm" onClick={() => onUpdate(tradie, Number(val) || 0)}>
          Save
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Tag queue -- */

function TagQueue({
  tags,
  users,
  onValidate,
}: {
  tags: CompanyTag[];
  users: (Tradie | Customer)[];
  onValidate: (tag: CompanyTag) => void;
}) {
  const userById = new Map(users.map((u) => [u.id, u]));
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {tags.length === 0 ? (
        <div className="empty">
          <div className="e-ico">✅</div>
          <p style={{ fontWeight: 700, color: 'var(--text)' }}>Nothing to validate</p>
          <p>No tags are awaiting validation.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Company</th>
              <th>Issued to</th>
              <th>Claiming tradie</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => {
              const claimer = tag.claimedByUserId ? userById.get(tag.claimedByUserId) : undefined;
              const claimerName =
                claimer && isTradie(claimer)
                  ? `${claimer.firstName} ${claimer.lastName}`
                  : claimer
                    ? claimer.email
                    : tag.claimedByUserId ?? '—';
              return (
                <tr key={tag.id}>
                  <td>
                    <span className="pill-code">{tag.code}</span>
                  </td>
                  <td className="faint">{tag.companyName}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{tag.issuedToName}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {tag.issuedToEmail}
                      {tag.issuedToPhone ? ` · ${tag.issuedToPhone}` : ''}
                    </div>
                  </td>
                  <td className="faint">{claimerName}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => onValidate(tag)}>
                      Validate
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Companies -- */

function Companies({
  companies,
  onUpdateCredits,
}: {
  companies: Company[];
  onUpdateCredits: (c: Company, n: number) => void;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {companies.length === 0 ? (
        <div className="empty">
          <div className="e-ico">🏢</div>
          <p>No companies.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Admin</th>
              <th>Status</th>
              <th>Rate card</th>
              <th>Shared credits</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 700 }}>{c.name}</td>
                <td className="faint">{c.billingEmail ?? c.adminEmail}</td>
                <td>
                  <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-amber'}`}>
                    {c.status ?? 'setup'}
                  </span>
                </td>
                <td className="faint">
                  {c.rateCard ? `${centsToDollars(c.rateCard.hourlyRateCents)}/hr` : '—'}
                </td>
                <td>
                  <SharedCreditControl company={c} onUpdate={onUpdateCredits} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SharedCreditControl({
  company,
  onUpdate,
}: {
  company: Company;
  onUpdate: (c: Company, n: number) => void;
}) {
  const [val, setVal] = useState(String(company.sharedCredits ?? 0));
  const dirty = val !== String(company.sharedCredits ?? 0);
  return (
    <div className="flex" style={{ gap: 6 }}>
      <input
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)' }}
      />
      {dirty && (
        <button className="btn btn-primary btn-sm" onClick={() => onUpdate(company, Number(val) || 0)}>
          Save
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Billing -- */

function Billing({ fees }: { fees: FeeLineItem[] }) {
  const months = Array.from(new Set(fees.map((f) => f.monthKey))).sort().reverse();
  const [month, setMonth] = useState(months[0] ?? currentMonthKey());
  const monthFees = fees.filter((f) => f.monthKey === month);

  // Group billable (non-waived) fees per payer for the monthly invoice run.
  const byPayer = new Map<string, { name: string; billable: number; waived: number; exGst: number; incGst: number }>();
  for (const f of monthFees) {
    const row = byPayer.get(f.tradieId) ?? { name: f.tradieName, billable: 0, waived: 0, exGst: 0, incGst: 0 };
    if (f.status === 'waived_credit') row.waived += 1;
    else {
      row.billable += 1;
      row.exGst += f.amountCents;
      row.incGst += f.amountCents + f.gstCents;
    }
    byPayer.set(f.tradieId, row);
  }
  const payers = [...byPayer.entries()];
  const totalIncGst = payers.reduce((s, [, r]) => s + r.incGst, 0);

  const downloadCsv = () => {
    const header = ['Tradie', 'Billable jobs', 'Free (waived)', 'Amount ex-GST', 'GST', 'Total incl. GST'];
    const rows = payers.map(([, r]) => [
      r.name,
      String(r.billable),
      String(r.waived),
      (r.exGst / 100).toFixed(2),
      ((r.incGst - r.exGst) / 100).toFixed(2),
      (r.incGst / 100).toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quickiefix-billing-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="between">
        <div className="flex" style={{ gap: 8 }}>
          {(months.length ? months : [currentMonthKey()]).map((m) => (
            <button
              key={m}
              className={`btn btn-sm ${month === m ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMonth(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          <span className="faint">
            {payers.length} payers · <strong style={{ color: 'var(--text)' }}>{fmtMoney(totalIncGst)}</strong> incl. GST
          </span>
          <button className="btn btn-primary btn-sm" onClick={downloadCsv} disabled={!payers.length}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 12, background: 'var(--amber-soft, #FFF7E6)' }}>
        <span className="faint" style={{ fontSize: 13 }}>
          Invoicing happens off-app. This is the run sheet: raise one invoice per payer from these
          totals (7-day terms), then use the Hold button on the Tradies tab for sustained non-payment.
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {payers.length === 0 ? (
          <div className="empty">
            <div className="e-ico">💳</div>
            <p>No fees recorded for {month}.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Payer</th>
                <th>Billable</th>
                <th>Free (waived)</th>
                <th>Ex-GST</th>
                <th>Total incl. GST</th>
              </tr>
            </thead>
            <tbody>
              {payers.map(([id, r]) => (
                <tr key={id}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.billable}</td>
                  <td className="faint">{r.waived}</td>
                  <td>{fmtMoney(r.exGst)}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMoney(r.incGst)}</td>
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
  no_tradie_found: 'badge-gray',
  accepted: 'badge-blue',
  confirmed: 'badge-blue',
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
