import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import {
  allAgenciesQuery,
  allAgencyLinksQuery,
  allCompaniesQuery,
  allComplaintsQuery,
  allFeesQuery,
  allJobsQuery,
  allPropertiesQuery,
  allUsersQuery,
  isTradie,
  mapWaitlistDoc,
  pendingTagsQuery,
  resolveComplaint,
  setApproval,
  setFreeCredits,
  setPaymentHold,
  setSharedCredits,
  validateTag,
  waitlistQuery,
} from '../adminApi';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { centsToDollars, formatDate, formatDuration, initials, stars } from '../lib';
import {
  Agency,
  AgencyLink,
  Company,
  CompanyTag,
  Complaint,
  Customer,
  FeeLineItem,
  Job,
  Property,
  Tradie,
  tradeLabel,
  WaitlistEntry,
} from '../types';
import {
  IconActivity,
  IconArrowRight,
  IconBilling,
  IconCheck,
  IconCompanies,
  IconComplaint,
  IconCustomers,
  IconJobs,
  IconLogout,
  IconMetrics,
  IconOverview,
  IconSearch,
  IconShield,
  IconTag,
  IconTradies,
  IconWaitlist,
} from './icons';

type Tab =
  | 'overview'
  | 'tradies'
  | 'tags'
  | 'companies'
  | 'agencies'
  | 'jobs'
  | 'customers'
  | 'waitlist'
  | 'billing'
  | 'complaints'
  | 'metrics';

type SvgIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type NavItem = { key: Tab; label: string; Icon: SvgIcon };
type NavGroup = { heading: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Operations',
    items: [
      { key: 'overview', label: 'Overview', Icon: IconOverview },
      { key: 'jobs', label: 'Jobs', Icon: IconJobs },
      { key: 'tags', label: 'Tag queue', Icon: IconTag },
      { key: 'complaints', label: 'Complaints', Icon: IconComplaint },
    ],
  },
  {
    heading: 'People',
    items: [
      { key: 'tradies', label: 'Tradies', Icon: IconTradies },
      { key: 'companies', label: 'Companies', Icon: IconCompanies },
      { key: 'agencies', label: 'Property agencies', Icon: IconCompanies },
      { key: 'customers', label: 'Customers', Icon: IconCustomers },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { key: 'billing', label: 'Billing', Icon: IconBilling },
      { key: 'metrics', label: 'Metrics', Icon: IconMetrics },
      { key: 'waitlist', label: 'Waitlist', Icon: IconWaitlist },
    ],
  },
];

const TAB_TITLES: Record<Tab, string> = {
  overview: 'Overview',
  tradies: 'Tradies',
  tags: 'Tag queue',
  companies: 'Companies',
  agencies: 'Property agencies',
  jobs: 'Jobs',
  customers: 'Customers',
  waitlist: 'Waitlist',
  billing: 'Billing',
  complaints: 'Complaints',
  metrics: 'Metrics',
};

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const ACTIVE_STATUSES = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];

/* ------------------------------------------------- Status chip system ---- */

type ChipTone =
  | 'bo-chip-grey'
  | 'bo-chip-blue'
  | 'bo-chip-amber'
  | 'bo-chip-green'
  | 'bo-chip-red'
  | 'bo-chip-redout';

function statusTone(status: string): ChipTone {
  switch (status) {
    case 'searching':
      return 'bo-chip-grey';
    case 'accepted':
    case 'confirmed':
      return 'bo-chip-blue';
    case 'travelling':
    case 'on_site':
      return 'bo-chip-amber';
    case 'completed':
      return 'bo-chip-green';
    case 'cancelled':
      return 'bo-chip-red';
    case 'no_tradie_found':
      return 'bo-chip-redout';
    default:
      return 'bo-chip-grey';
  }
}

function StatusChip({ status }: { status: string }) {
  return <span className={`bo-chip ${statusTone(status)}`}>{status.replace(/_/g, ' ')}</span>;
}

function relativeTime(ts?: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

export function BackOffice() {
  const { adminEmail, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  // Live listeners: every approval, hold, credit change or new signup reflects
  // instantly — no full reload of seven collections after each click.
  const usersLive = useLive<Tradie | Customer>('admin:users', allUsersQuery);
  const jobsLive = useLive<Job>('admin:jobs', allJobsQuery);
  const complaintsLive = useLive<Complaint>('admin:complaints', allComplaintsQuery);
  const companiesLive = useLive<Company>('admin:companies', allCompaniesQuery);
  const feesLive = useLive<FeeLineItem>('admin:fees', allFeesQuery);
  const pendingTagsLive = useLive<CompanyTag>('admin:pendingTags', pendingTagsQuery);
  const waitlistLive = useLive<WaitlistEntry>('admin:waitlist', waitlistQuery, mapWaitlistDoc);
  const agenciesLive = useLive<Agency>('admin:agencies', allAgenciesQuery);
  const propertiesLive = useLive<Property>('admin:properties', allPropertiesQuery);
  const agencyLinksLive = useLive<AgencyLink>('admin:agencyLinks', allAgencyLinksQuery);
  const loading =
    !usersLive || !jobsLive || !complaintsLive || !companiesLive || !feesLive ||
    !pendingTagsLive || !waitlistLive || !agenciesLive || !propertiesLive || !agencyLinksLive;

  const users = usersLive ?? [];
  const companies = companiesLive ?? [];
  const jobs = useMemo(
    () => [...(jobsLive ?? [])].sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt),
    [jobsLive],
  );
  const complaints = useMemo(
    () => [...(complaintsLive ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [complaintsLive],
  );
  const fees = useMemo(
    () => [...(feesLive ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [feesLive],
  );
  const pendingTags = useMemo(
    () =>
      [...(pendingTagsLive ?? [])].sort(
        (a, b) => (a.claimedAt ?? a.createdAt) - (b.claimedAt ?? b.createdAt),
      ),
    [pendingTagsLive],
  );
  const waitlist = useMemo(
    () => [...(waitlistLive ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [waitlistLive],
  );

  useEffect(() => {
    document.title = `${TAB_TITLES[tab]} · QuickieFix Back Office`;
  }, [tab]);

  const tradies = users.filter(isTradie) as Tradie[];
  const customers = users.filter((u) => u.role === 'customer') as Customer[];
  const openComplaints = complaints.filter((c) => c.status === 'open');
  const pendingApprovals = tradies.filter((t) => t.approval === 'pending').length;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Writes reflect instantly through the live listeners — no reload needed.
  const approve = async (t: Tradie, approval: Tradie['approval']) => {
    await setApproval(t.id, approval);
  };
  const resolve = async (c: Complaint) => {
    await resolveComplaint(c.id);
  };
  const toggleHold = async (t: Tradie) => {
    await setPaymentHold(t.id, !t.paymentHold);
  };
  const updateCredits = async (t: Tradie, credits: number) => {
    await setFreeCredits(t.id, credits);
  };
  const approveTag = async (tag: CompanyTag) => {
    await validateTag(tag.id);
  };
  const updateSharedCredits = async (c: Company, n: number) => {
    await setSharedCredits(c.id, n);
  };

  const counts: Partial<Record<Tab, number>> = {
    tags: pendingTags.length,
    complaints: openComplaints.length,
  };

  return (
    <div className="bo-shell">
      <aside className="bo-sidebar">
        <div className="bo-brand">
          <img
            src="/logo-lockup-reversed.svg"
            alt="QuickieFix"
            style={{ height: 30, width: 'auto', display: 'block' }}
          />
        </div>

        <nav>
          {NAV_GROUPS.map((group) => (
            <div className="bo-navgroup" key={group.heading}>
              <div className="bo-navlabel">{group.heading}</div>
              {group.items.map((n) => {
                const count = counts[n.key] ?? 0;
                return (
                  <div
                    key={n.key}
                    className={`bo-navitem${tab === n.key ? ' active' : ''}`}
                    onClick={() => setTab(n.key)}
                  >
                    <span className="bo-ico">
                      <n.Icon size={18} />
                    </span>
                    <span className="bo-navtext">{n.label}</span>
                    {count > 0 && <span className="bo-count">{count}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="bo-sidefoot">
          <div className="bo-admincard">
            <div className="bo-admin-id">
              <span className="bo-admin-icon">
                <IconShield size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="bo-admin-name">Platform Admin</div>
                <div className="bo-admin-mail">{adminEmail}</div>
              </div>
            </div>
            <button className="bo-logout" onClick={logout}>
              <IconLogout size={16} />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="bo-main">
        <header className="bo-header">
          <h1 className="bo-title">{TAB_TITLES[tab]}</h1>
          <div className="bo-header-right">
            <div className="bo-search">
              <IconSearch size={15} />
              <span>Search</span>
              <span className="bo-kbd">⌘K</span>
            </div>
            <span className="bo-date">{today}</span>
          </div>
        </header>
        <div className="bo-content">
          <div className="bo-content-inner">
          {loading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
              <div className="spinner" />
            </div>
          ) : tab === 'overview' ? (
            <Overview
              tradies={tradies}
              jobs={jobs}
              pendingApprovals={pendingApprovals}
              pendingTags={pendingTags.length}
              openComplaints={openComplaints.length}
              onNavigate={setTab}
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
          ) : tab === 'agencies' ? (
            <Agencies
              agencies={agenciesLive ?? []}
              properties={propertiesLive ?? []}
              links={agencyLinksLive ?? []}
              jobs={jobs}
            />
          ) : tab === 'jobs' ? (
            <Jobs jobs={jobs} />
          ) : tab === 'customers' ? (
            <Customers customers={customers} jobs={jobs} />
          ) : tab === 'waitlist' ? (
            <Waitlist entries={waitlist} />
          ) : tab === 'billing' ? (
            <Billing fees={fees} />
          ) : tab === 'complaints' ? (
            <Complaints complaints={complaints} onResolve={resolve} />
          ) : (
            <Metrics jobs={jobs} tradies={tradies} />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Overview -- */

function Overview({
  tradies,
  jobs,
  pendingApprovals,
  pendingTags,
  openComplaints,
  onNavigate,
}: {
  tradies: Tradie[];
  jobs: Job[];
  pendingApprovals: number;
  pendingTags: number;
  openComplaints: number;
  onNavigate: (tab: Tab) => void;
}) {
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;

  const kpis: { label: string; value: number; Icon: SvgIcon; tab: Tab; live?: boolean }[] = [
    { label: 'Total jobs', value: jobs.length, Icon: IconJobs, tab: 'jobs' },
    { label: 'Completed', value: completed, Icon: IconCheck, tab: 'jobs' },
    { label: 'Active now', value: active, Icon: IconActivity, tab: 'jobs', live: true },
    { label: 'Tradies', value: tradies.length, Icon: IconTradies, tab: 'tradies' },
  ];

  const attn: { label: string; count: number; tab: Tab }[] = [
    { label: 'Pending approvals', count: pendingApprovals, tab: 'tradies' },
    { label: 'Tag queue', count: pendingTags, tab: 'tags' },
    { label: 'Open complaints', count: openComplaints, tab: 'complaints' },
  ];

  const recentJobs = [...jobs]
    .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt)
    .slice(0, 10);

  return (
    <>
      {/* Band 1 — KPI row */}
      <section className="bo-band">
        <div className="bo-kpi-grid">
          {kpis.map((k) => (
            <button className="bo-kpi" key={k.label} onClick={() => onNavigate(k.tab)}>
              <span className="bo-kpi-chip">
                <k.Icon size={16} />
              </span>
              <div className="bo-kpi-label">{k.label}</div>
              <div className="bo-kpi-value">
                {k.value.toLocaleString()}
                {k.live && k.value > 0 && <span className="bo-dot" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Band 2 — Needs attention */}
      <section className="bo-band">
        <h2 className="bo-sectionhead">Needs attention</h2>
        <div className="bo-attn-grid">
          {attn.map((a) =>
            a.count > 0 ? (
              <div className="bo-attn alert" key={a.label}>
                <div className="bo-attn-label">{a.label}</div>
                <div className="bo-attn-count bo-num">{a.count.toLocaleString()}</div>
                <button className="bo-attn-review" onClick={() => onNavigate(a.tab)}>
                  Review <IconArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="bo-attn calm" key={a.label}>
                <div className="bo-attn-label">{a.label}</div>
                <span className="bo-attn-calmtext">
                  <span className="bo-check">
                    <IconCheck size={15} />
                  </span>
                  Nothing waiting
                </span>
              </div>
            ),
          )}
        </div>
      </section>

      {/* Band 3 — Activity */}
      <section className="bo-band">
        <div className="bo-activity-grid">
          <div className="bo-card bo-panel">
            <div className="bo-panel-head">Recent jobs</div>
            {recentJobs.length === 0 ? (
              <div className="bo-empty">
                <span className="bo-empty-ico">
                  <IconJobs size={26} />
                </span>
                <div className="bo-empty-title">No jobs yet</div>
                <div className="bo-empty-sub">Jobs will appear here as customers request them.</div>
              </div>
            ) : (
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>Trade</th>
                    <th>Location</th>
                    <th>Tradie</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ fontWeight: 600 }}>{tradeLabel(j.trade)}</td>
                      <td className="faint">{j.location?.address ?? '—'}</td>
                      <td className="faint">{j.tradieName ?? '—'}</td>
                      <td>
                        <StatusChip status={j.status} />
                      </td>
                      <td className="bo-num-cell faint">{relativeTime(j.timestamps.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bo-card bo-panel">
            <div className="bo-panel-head">Activity feed</div>
            <div className="bo-feed">
              {[0, 1, 2, 3].map((i) => (
                <div className="bo-feed-row" key={i}>
                  <div className="bo-skel-dot" />
                  <div className="bo-skel-lines">
                    <div className="bo-skel-line" />
                    <div className="bo-skel-line short" />
                  </div>
                </div>
              ))}
              <div className="bo-feed-note">
                <IconActivity size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Activity feed coming soon
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
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

/* ------------------------------------------------------ Property agencies -- */

function Agencies({
  agencies,
  properties,
  links,
  jobs,
}: {
  agencies: Agency[];
  properties: Property[];
  links: AgencyLink[];
  jobs: Job[];
}) {
  const rows = [...agencies]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => {
      const props = properties.filter(
        (p) => p.agencyId === a.id || p.landlordId === a.adminUserId,
      );
      const aLinks = links.filter((l) => l.agencyId === a.id && l.status !== 'removed');
      const panel = aLinks.filter((l) => l.kind !== 'tenant' && l.status === 'approved').length;
      const pending = aLinks.filter((l) => l.status === 'pending').length;
      const aJobs = jobs.filter((j) => j.agencyId === a.id);
      return {
        agency: a,
        propertyCount: props.length,
        tenantsLinked: props.reduce((s, p) => s + p.tenantIds.length, 0),
        panel,
        pending,
        jobsTotal: aJobs.length,
        jobsCompleted: aJobs.filter((j) => j.status === 'completed').length,
      };
    });

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {rows.length === 0 ? (
        <div className="empty">
          <div className="e-ico">🏢</div>
          <p>No property agencies yet.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Agency</th>
              <th>Admin</th>
              <th>Code</th>
              <th>Properties</th>
              <th>Tenants linked</th>
              <th>Panel</th>
              <th>Jobs</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agency: a, ...r }) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 700 }}>{a.name}</td>
                <td className="faint">{a.adminEmail}</td>
                <td>
                  <span className="badge badge-grey" style={{ fontFamily: 'monospace' }}>
                    {a.code}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{r.propertyCount}</td>
                <td>{r.tenantsLinked}</td>
                <td>
                  {r.panel} approved
                  {r.pending > 0 && (
                    <span className="badge badge-amber" style={{ marginLeft: 6 }}>
                      {r.pending} pending
                    </span>
                  )}
                </td>
                <td className="faint">
                  {r.jobsCompleted}/{r.jobsTotal} done
                </td>
                <td className="faint">{formatDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    const header = ['Tradie', 'Billable jobs', 'Free (waived)', 'Total'];
    const rows = payers.map(([, r]) => [
      r.name,
      String(r.billable),
      String(r.waived),
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
            {payers.length} payers · <strong style={{ color: 'var(--text)' }}>{fmtMoney(totalIncGst)}</strong> total
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
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {payers.map(([id, r]) => (
                <tr key={id}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.billable}</td>
                  <td className="faint">{r.waived}</td>
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
                    <StatusChip status={j.status} />
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

/* -------------------------------------------------------------- Waitlist -- */

function Waitlist({ entries }: { entries: WaitlistEntry[] }) {
  const customers = entries.filter((e) => e.role === 'customer').length;
  const tradies = entries.filter((e) => e.role === 'tradie').length;

  const downloadCsv = () => {
    const header = ['Email', 'Role', 'Joined', 'Source'];
    const rows = entries.map((e) => [
      e.email,
      e.role,
      formatDate(e.createdAt),
      e.source ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quickiefix-waitlist.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="between">
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          <span className="faint">
            <strong style={{ color: 'var(--text)' }}>{entries.length}</strong> signups ·{' '}
            <span className="badge badge-blue">{customers} customers</span>{' '}
            <span className="badge badge-green">{tradies} tradies</span>
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={downloadCsv} disabled={!entries.length}>
          ⬇ Export CSV
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {entries.length === 0 ? (
          <div className="empty">
            <div className="e-ico">✉️</div>
            <p>No signups yet.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.email}</td>
                  <td>
                    <span className={`badge ${e.role === 'tradie' ? 'badge-green' : 'badge-blue'}`}>
                      {e.role}
                    </span>
                  </td>
                  <td>{formatDate(e.createdAt)}</td>
                  <td className="faint">{e.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
              {c.kind === 'support'
                ? `🛟 Support · ${c.customerName}${c.raisedByRole ? ` (${c.raisedByRole})` : ''}${c.contactEmail ? ` · ${c.contactEmail}` : ''}`
                : `${c.trade ? tradeLabel(c.trade) : 'Job'} · ${c.customerName}${c.tradieName ? ` → ${c.tradieName}` : ''}`}
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

/* --------------------------------------------------------------- Metrics -- */

/** Median of a list of numbers. Returns undefined for an empty array. */
function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function Metrics({ jobs, tradies }: { jobs: Job[]; tradies: Tradie[] }) {
  void tradies; // gates are computed purely from the jobs array

  // 1. Median time-to-accept (acceptedAt - searchingAt), minutes; green < 5.
  const acceptDurations = jobs
    .filter((j) => j.timestamps.acceptedAt != null && j.timestamps.searchingAt != null)
    .map((j) => (j.timestamps.acceptedAt as number) - (j.timestamps.searchingAt as number))
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  const medAcceptMs = median(acceptDurations);
  const medAcceptMin = medAcceptMs != null ? medAcceptMs / 60000 : undefined;

  // 2. Median time-to-arrival (onSiteAt - acceptedAt), minutes; green < 45.
  const arrivalDurations = jobs
    .filter((j) => j.timestamps.onSiteAt != null && j.timestamps.acceptedAt != null)
    .map((j) => (j.timestamps.onSiteAt as number) - (j.timestamps.acceptedAt as number))
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  const medArrivalMs = median(arrivalDurations);
  const medArrivalMin = medArrivalMs != null ? medArrivalMs / 60000 : undefined;

  // 3. Jobs per tradie per week; green >= 1.5.
  const completed = jobs.filter((j) => j.status === 'completed');
  const distinctTradies = new Set(
    completed.map((j) => j.tradieId).filter((id): id is string => id != null),
  );
  const completedTimes = completed
    .map((j) => j.timestamps.completedAt)
    .filter((t): t is number => t != null);
  let jobsPerTradieWeek: number | undefined;
  if (completed.length > 0 && distinctTradies.size > 0 && completedTimes.length > 0) {
    const span = Math.max(...completedTimes) - Math.min(...completedTimes);
    const weeks = Math.max(1, span / WEEK_MS);
    jobsPerTradieWeek = completed.length / distinctTradies.size / weeks;
  }

  // 4. No-tradie-found rate among emergency jobs; green < 10%.
  const emergencyJobs = jobs.filter((j) => j.isEmergency === true);
  const emergencyNoTradie = emergencyJobs.filter((j) => j.status === 'no_tradie_found').length;
  const noTradieRate =
    emergencyJobs.length > 0 ? (emergencyNoTradie / emergencyJobs.length) * 100 : undefined;

  type Gate = {
    label: string;
    value: string;
    target: string;
    pass: boolean | undefined; // undefined = no data
  };

  const gates: Gate[] = [
    {
      label: 'Median time-to-accept',
      value: medAcceptMin != null ? `${medAcceptMin.toFixed(1)} min` : '—',
      target: '< 5 min',
      pass: medAcceptMin != null ? medAcceptMin < 5 : undefined,
    },
    {
      label: 'Median time-to-arrival',
      value: medArrivalMin != null ? `${medArrivalMin.toFixed(0)} min` : '—',
      target: '< 45 min',
      pass: medArrivalMin != null ? medArrivalMin < 45 : undefined,
    },
    {
      label: 'Jobs per tradie / week',
      value: jobsPerTradieWeek != null ? jobsPerTradieWeek.toFixed(2) : '—',
      target: '≥ 1.5',
      pass: jobsPerTradieWeek != null ? jobsPerTradieWeek >= 1.5 : undefined,
    },
    {
      label: 'No-tradie-found (emergency)',
      value: noTradieRate != null ? `${noTradieRate.toFixed(1)}%` : '—',
      target: '< 10%',
      pass: noTradieRate != null ? noTradieRate < 10 : undefined,
    },
  ];

  const badge = (pass: boolean | undefined) => {
    if (pass === undefined) return { cls: 'badge-gray', text: 'no data' };
    return pass ? { cls: 'badge-green', text: 'PASS' } : { cls: 'badge-amber', text: 'watch' };
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid stat-grid">
        {gates.map((g) => {
          const b = badge(g.pass);
          return (
            <div className="stat" key={g.label}>
              <div className="between" style={{ marginBottom: 6 }}>
                <span className={`badge ${b.cls}`}>{b.text}</span>
              </div>
              <div className="v">{g.value}</div>
              <div className="l">{g.label}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                Target {g.target}
              </div>
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: 13 }}>
        Gates are computed from live job data; the pilot must sustain these for 4+ weeks (Spec §8).
      </div>
    </div>
  );
}
