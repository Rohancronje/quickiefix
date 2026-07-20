import { httpsCallable } from 'firebase/functions';
import { useMemo, useState } from 'react';
import {
  addAgencyProperty,
  agencyJobsQuery,
  agencyPropertiesQuery,
  approveAgencyLink,
  confirmTenantLink,
  linkTenantByEmail,
  panelQuery,
  parsePortfolioCsv,
  PORTFOLIO_TEMPLATE,
  PortfolioRow,
  recordTenantInvite,
  removeAgencyLink,
  removeProperty,
  unlinkTenant,
} from '../agencyApi';
import { AddressInput } from '../components/AddressInput';
import { useAuth } from '../auth';
import { confirmDialog } from '../components/confirm';
import { functions } from '../firebase';
import {
  IconActivity,
  IconBilling,
  IconBriefcase,
  IconCheck,
  IconCompanies,
  IconComplaint,
  IconLogout,
  IconMetrics,
  IconOverview,
  IconTradies,
} from '../backoffice/icons';
import { SupportForm } from '../components/SupportForm';
import { AgencyRequestHelp } from './AgencyRequestHelp';
import { useLive } from '../live';
import { updateAgencyName } from '../agencyApi';
import { formatDate, formatDuration, formatWhen } from '../lib';
import { Agency, AgencyLink, Job, Property, tradeLabel } from '../types';

type Tab =
  | 'dashboard'
  | 'request'
  | 'jobs'
  | 'panel'
  | 'properties'
  | 'reports'
  | 'support'
  | 'settings';

const KIND_LABEL: Record<AgencyLink['kind'], string> = {
  tradie: 'Individual tradie',
  company: 'Trade company (covers their team)',
  tenant: 'Tenant',
};

const STATUS_CHIP: Record<string, string> = {
  searching: 'co-chip-amber',
  booked: 'co-chip-blue',
  confirmed: 'co-chip-blue',
  travelling: 'co-chip-blue',
  on_site: 'co-chip-blue',
  completed: 'co-chip-green',
  cancelled: 'co-chip-grey',
  no_tradie_found: 'co-chip-amber',
};

/** True when a scheduled booking needs the PM's attention: the tradie has
 *  been flagged as a no-show risk, or hasn't confirmed attendance yet. */
function bookingAtRisk(j: Job): boolean {
  return j.status === 'booked' && (!!j.booking?.noShowFlaggedAt || !j.booking?.attendanceConfirmedAt);
}

/** Status cell that understands bookings — shows the scheduled time and a
 *  confirmed / unconfirmed / no-show-risk state for `booked` jobs. */
function JobStatusCell({ job }: { job: Job }) {
  if (job.status === 'booked') {
    const b = job.booking;
    const cls = b?.noShowFlaggedAt ? 'co-chip-red' : b?.attendanceConfirmedAt ? 'co-chip-blue' : 'co-chip-amber';
    const label = b?.noShowFlaggedAt
      ? '⚠️ no-show risk'
      : b?.attendanceConfirmedAt
        ? 'booked · confirmed'
        : 'booked · unconfirmed';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
        <span className={`co-chip ${cls}`}>{label}</span>
        {job.scheduledFor != null && (
          <span className="co-sub" style={{ fontSize: 11.5 }}>🗓️ {formatWhen(job.scheduledFor)}</span>
        )}
      </div>
    );
  }
  return (
    <span className={`co-chip ${STATUS_CHIP[job.status] ?? 'co-chip-grey'}`}>
      {job.status.replace(/_/g, ' ')}
    </span>
  );
}

/** Property-agency portal: dashboard, approved panel, portfolio. */
export function AgencyPortal({ agency }: { agency: Agency }) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  // Live listeners: instant paint from the local cache, and every change
  // (approval, removal, job status, tenant confirm) reflects immediately.
  const linksLive = useLive<AgencyLink>(`panel:${agency.id}`, () => panelQuery(agency.id));
  const propertiesLive = useLive<Property>(`agencyProps:${agency.adminUserId}`, () =>
    agencyPropertiesQuery(agency.adminUserId),
  );
  const jobsLive = useLive<Job>(`agencyJobs:${agency.id}`, () => agencyJobsQuery(agency.id));
  const loading = !linksLive || !propertiesLive || !jobsLive;
  const links = useMemo(
    () => [...(linksLive ?? [])].sort((a, b) => b.requestedAt - a.requestedAt),
    [linksLive],
  );
  const properties = useMemo(
    () => [...(propertiesLive ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [propertiesLive],
  );
  const jobs = useMemo(
    () => [...(jobsLive ?? [])].sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt),
    [jobsLive],
  );
  const [toast, setToast] = useState<string | null>(null);
  // Add-property form
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [busy, setBusy] = useState(false);
  // Per-property tenant email inputs
  const [tenantEmail, setTenantEmail] = useState<Record<string, string>>({});
  // Tradie/company panel invites (tenant invites are per-property)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  // Bulk portfolio import
  const [importRows, setImportRows] = useState<PortfolioRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  // Jobs tab filters
  const [jobFilter, setJobFilter] = useState<'All' | 'Live' | 'Booked' | 'Completed'>('All');
  const [jobProperty, setJobProperty] = useState('All');
  // Settings
  const [agencyName, setAgencyName] = useState(agency.name);
  const [savingName, setSavingName] = useState(false);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const pending = links.filter((l) => l.status === 'pending');
  const panelPending = pending.filter((l) => l.kind !== 'tenant');
  const tenantPending = pending.filter((l) => l.kind === 'tenant');
  const approved = links.filter((l) => l.status === 'approved');
  const approvedPanel = approved.filter((l) => l.kind !== 'tenant');
  const approvedTenants = approved.filter((l) => l.kind === 'tenant');
  const confirmedTenantEmails = approvedTenants.map((l) => l.memberEmail).filter(Boolean) as string[];
  // Confirmed tenants who are NOT linked to any property yet — they can't
  // raise repairs against their address until this is fixed, so shout.
  const linkedTenantIds = new Set(properties.flatMap((p) => p.tenantIds));
  const unlinkedTenants = approvedTenants.filter((l) => !linkedTenantIds.has(l.memberId));
  const tenantsLinked = properties.reduce((s, p) => s + p.tenantIds.length, 0);
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;
  const activeJobs = jobs.filter((j) =>
    ['searching', 'booked', 'confirmed', 'travelling', 'on_site'].includes(j.status),
  ).length;
  // Upcoming scheduled bookings, and those needing the PM's attention.
  const bookings = jobs.filter((j) => j.status === 'booked');
  const atRiskBookings = bookings.filter(bookingAtRisk);

  /* ------------------------------------------------------------ actions -- */

  const approve = async (l: AgencyLink) => {
    const message =
      l.kind === 'tenant'
        ? "Confirms them as your tenant — they'll be linked to the property you invited them to automatically."
        : `${l.kind === 'company' ? `Covers their ${l.scope === 'employees' ? 'employees (contractors excluded)' : 'whole team'}. ` : ''}Jobs at your properties will dispatch to them, on your agency's commercial terms.`;
    if (
      !(await confirmDialog(`${l.kind === 'tenant' ? 'Confirm' : 'Approve'} ${l.memberName}?`, {
        message,
        confirmLabel: l.kind === 'tenant' ? 'Confirm tenant' : 'Approve',
      }))
    )
      return;
    try {
      if (l.kind === 'tenant') {
        const matched = await confirmTenantLink(agency, l);
        flash(
          matched
            ? `${l.memberName} confirmed — linked to ${matched} ✓`
            : `${l.memberName} confirmed — no matching invite, link them to a property manually`,
        );
      } else {
        await approveAgencyLink(l.id);
        flash(`${l.memberName} approved ✓`);
      }
    } catch (e) {
      flash(`Could not approve: ${(e as Error).message}`);
    }
  };

  const remove = async (l: AgencyLink) => {
    if (
      !(await confirmDialog(`Remove ${l.memberName}?`, {
        message:
          l.kind === 'tenant'
            ? 'They lose the link to your agency (any property links stay until you unlink them).'
            : 'They stop receiving jobs at your properties immediately.',
        confirmLabel: 'Remove',
        danger: true,
      }))
    )
      return;
    try {
      await removeAgencyLink(l.id);
      flash('Removed');
    } catch (e) {
      flash(`Could not remove: ${(e as Error).message}`);
    }
  };

  const addProperty = async () => {
    if (!address.trim()) return;
    const invitee = newTenantEmail.trim().toLowerCase();
    setBusy(true);
    try {
      await addAgencyProperty(agency, {
        label,
        address,
        ...(coords ?? {}),
        ...(invitee ? { invitedTenantEmail: invitee } : {}),
      });
      if (invitee) {
        await httpsCallable(functions, 'sendAgencyInvite')({
          email: invitee,
          name: newTenantName.trim(),
          kind: 'tenant',
          propertyAddress: label.trim() || address.trim(),
        });
      }
      setLabel('');
      setAddress('');
      setCoords(null);
      setNewTenantName('');
      setNewTenantEmail('');
      flash(invitee ? `Property added — invite sent to ${invitee} ✓` : 'Property added ✓');
    } catch (e) {
      flash(`Could not add: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Link an EXISTING app account to the property (confirmed tenants appear
   *  as suggestions), or send a fresh invite tied to this property. */
  const linkTenant = async (p: Property) => {
    const email = (tenantEmail[p.id] ?? '').trim();
    if (!email) return;
    try {
      await linkTenantByEmail(p, email);
      setTenantEmail((m) => ({ ...m, [p.id]: '' }));
      flash('Tenant linked to property ✓');
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const inviteTenantToProperty = async (p: Property) => {
    const email = (tenantEmail[p.id] ?? '').trim();
    if (!email) return;
    try {
      await httpsCallable(functions, 'sendAgencyInvite')({
        email,
        kind: 'tenant',
        propertyAddress: p.label || p.address,
      });
      await recordTenantInvite(p, email);
      setTenantEmail((m) => ({ ...m, [p.id]: '' }));
      flash(`Invite sent to ${email} — they'll auto-link to ${p.label || p.address} on confirm ✓`);
    } catch (e) {
      flash(`Could not invite: ${(e as Error).message}`);
    }
  };

  const deleteProperty = async (p: Property) => {
    if (
      !(await confirmDialog(`Remove ${p.label || p.address}?`, {
        message: `${p.tenantIds.length > 0 ? `${p.tenantIds.length} linked tenant${p.tenantIds.length === 1 ? '' : 's'} will lose the property in their app. ` : ''}Past jobs and their records are unaffected.`,
        confirmLabel: 'Remove property',
        danger: true,
      }))
    )
      return;
    try {
      await removeProperty(p.id);
      flash('Property removed');
    } catch (e) {
      flash(`Could not remove: ${(e as Error).message}`);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(agency.code);
    flash('Agent code copied');
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await httpsCallable(functions, 'sendAgencyInvite')({ email: inviteEmail, kind: 'tradie' });
      flash(`Invite sent to ${inviteEmail.trim()} ✓`);
      setInviteEmail('');
    } catch (e) {
      flash(`Could not send: ${(e as Error).message}`);
    } finally {
      setInviting(false);
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportRows(parsePortfolioCsv(await file.text()));
    e.target.value = '';
  };

  const runImport = async () => {
    if (!importRows) return;
    const valid = importRows.filter((r) => !r.error);
    setImporting(true);
    let done = 0;
    for (const row of valid) {
      try {
        await addAgencyProperty(agency, {
          label: row.label,
          address: row.address,
          invitedTenantEmail: row.tenantEmail,
        });
        if (row.tenantEmail) {
          await httpsCallable(functions, 'sendAgencyInvite')({
            email: row.tenantEmail,
            name: row.tenantName ?? '',
            kind: 'tenant',
            propertyAddress: row.label || row.address,
          });
        }
      } catch {
        /* keep going — summary below */
      }
      done++;
      setImportProgress(`${done}/${valid.length}`);
    }
    setImporting(false);
    setImportRows(null);
    setImportProgress('');
    flash(`Imported ${valid.length} propert${valid.length === 1 ? 'y' : 'ies'} — tenant invites sent ✓`);
  };

  const downloadTemplate = () => {
    const blob = new Blob([PORTFOLIO_TEMPLATE], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quickiefix-portfolio-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* -------------------------------------------------------------- shell -- */

  const NAV: { key: Tab; label: string; Icon: typeof IconOverview }[] = [
    { key: 'dashboard', label: 'Dashboard', Icon: IconOverview },
    { key: 'request', label: 'Request help', Icon: IconCheck },
    { key: 'jobs', label: 'Jobs', Icon: IconActivity },
    { key: 'panel', label: 'Tradie panel', Icon: IconTradies },
    { key: 'properties', label: 'Properties', Icon: IconBriefcase },
    { key: 'reports', label: 'Owner reports', Icon: IconMetrics },
    { key: 'support', label: 'Support', Icon: IconComplaint },
    { key: 'settings', label: 'Settings', Icon: IconBilling },
  ];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const steps = [
    { label: 'Create your agency account', done: true },
    {
      label: 'Add your first property',
      sub: 'Your portfolio decides which jobs route to your panel',
      done: properties.length > 0,
      action: { label: 'Add property', tab: 'properties' as Tab },
    },
    {
      label: 'Build your tradie panel',
      sub: 'Invite the tradies and companies you trust — only they get your jobs',
      done: approvedPanel.length > 0,
      action: { label: 'Invite tradies', tab: 'panel' as Tab },
    },
    {
      label: 'Invite your tenants',
      sub: 'They report repairs themselves — you keep the paper trail',
      done: tenantsLinked > 0 || approvedTenants.length > 0,
      action: { label: 'Invite tenants', tab: 'panel' as Tab },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const currentIdx = steps.findIndex((s) => !s.done);
  // Once set up (all steps ticked) — or once real jobs flow — the checklist
  // is done for good; show the working dashboard.
  const activated =
    completedJobs > 0 || activeJobs > 0 || doneCount === steps.length;

  const inviteBox = (
    <div className="co-card" style={{ marginBottom: 16 }}>
      <div className="co-sectionhead">Invite a tradie or trade company</div>
      <p className="co-help">
        The invite carries the app download link, your agent code
        <span className="co-code" style={{ margin: '0 6px' }}>{agency.code}</span>
        <button className="co-btn co-btn-ghost co-btn-sm" onClick={copyCode}>Copy</button>
        and step-by-step instructions. Tenant invites live on the Properties tab — they're always
        tied to a property.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="co-input"
          style={{ flex: '1 1 220px' }}
          placeholder="tradie@business.co.nz"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <button
          className="co-btn co-btn-primary co-btn-sm"
          disabled={inviting || !inviteEmail.trim()}
          onClick={sendInvite}
        >
          {inviting ? 'Sending…' : '✉️ Send invite'}
        </button>
      </div>
    </div>
  );

  const linkRow = (l: AgencyLink, actions: React.ReactNode) => (
    <div
      key={l.id}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{l.memberName}</div>
        <div className="co-sub" style={{ fontSize: 12 }}>
          {KIND_LABEL[l.kind]}
          {l.kind === 'company' && l.scope === 'employees' ? ' · employees only' : ''}
          {l.memberEmail ? ` · ${l.memberEmail}` : ''}
        </div>
      </div>
      {actions}
    </div>
  );

  return (
    <div className="co-shell">
      <aside className="co-sidebar">
        <div className="co-brand">
          <img src="/logo-lockup-reversed.svg" alt="QuickieFix" style={{ height: 30, width: 'auto', display: 'block' }} />
        </div>
        <nav className="co-nav">
          {NAV.map((n) => (
            <div
              key={n.key}
              className={`co-navitem${tab === n.key ? ' active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <span className="co-ico">
                <n.Icon size={18} />
              </span>
              <span className="co-navtext">{n.label}</span>
            </div>
          ))}
        </nav>
        <div className="co-sidefoot">
          <div className="co-idcard">
            <div className="co-id-row">
              <span className="co-id-icon">
                <IconCompanies size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="co-id-name">{agency.name}</div>
                <div className="co-id-mail">{agency.adminEmail}</div>
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
          <h1 className="co-title">
            {
              {
                dashboard: `Welcome back, ${agency.name} 👋`,
                request: 'Request help at a property',
                jobs: 'Jobs at your properties',
                panel: 'Tradie panel & invites',
                properties: 'Properties & tenants',
                reports: 'Owner reports',
                support: 'Support',
                settings: 'Settings',
              }[tab]
            }
          </h1>
          <span className="co-date">{today}</span>
        </header>
        <div className="co-content">
          <div className="co-content-inner">
            {/* ------------------------------------------------ DASHBOARD -- */}
            {tab === 'dashboard' && (
              <>
                {!activated && (
                  <div className="co-card" style={{ marginBottom: 16 }}>
                    <div className="co-setup-head">
                      <span className="co-card-title">Get your portfolio live</span>
                      <span className="co-setup-count">{doneCount} of 4 done</span>
                    </div>
                    <div className="co-setup-bar">
                      <div className="co-setup-bar-fill" style={{ width: `${(doneCount / 4) * 100}%` }} />
                    </div>
                    <div className="co-setup-steps">
                      {steps.map((s, i) => (
                        <div key={s.label} className={`co-setup-step ${i === currentIdx ? 'current' : ''}`}>
                          <span className={`co-setup-num ${s.done ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                            {s.done ? <IconCheck size={13} /> : i + 1}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className={`co-setup-label ${s.done ? 'done' : ''}`}>{s.label}</div>
                            {i === currentIdx && s.sub && <div className="co-setup-sub">{s.sub}</div>}
                          </div>
                          {i === currentIdx && s.action && (
                            <button className="co-btn co-btn-dark co-btn-sm" onClick={() => setTab(s.action.tab)}>
                              {s.action.label}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="co-setup-foot">
                      The first repair raised at one of your properties completes the picture.
                    </div>
                  </div>
                )}

                <section className="co-band">
                  <div className="co-kpi-grid">
                    {[
                      { label: 'Properties', value: String(properties.length) },
                      { label: 'Tenants linked', value: String(tenantsLinked) },
                      { label: 'Panel members', value: String(approvedPanel.length) },
                      { label: 'Jobs (active / done)', value: `${activeJobs} / ${completedJobs}` },
                    ].map((k) => (
                      <div className="co-kpi" key={k.label}>
                        <div className="co-kpi-label">{k.label}</div>
                        <div className="co-kpi-value">{k.value}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {bookings.length > 0 && (
                  <div
                    className="co-card"
                    style={{
                      marginBottom: 16,
                      ...(atRiskBookings.length > 0
                        ? { border: '1px solid #E8B33C', background: '#FFF9EC' }
                        : {}),
                    }}
                  >
                    <div className="co-sectionhead">
                      🗓️ Upcoming bookings ({bookings.length})
                      {atRiskBookings.length > 0 ? ` · ${atRiskBookings.length} need attention` : ''}
                    </div>
                    <table className="co-table">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Trade</th>
                          <th>When</th>
                          <th>Tradie</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...bookings]
                          .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
                          .slice(0, 15)
                          .map((j) => (
                            <tr key={j.id}>
                              <td className="co-sub">{j.location.address}</td>
                              <td>{tradeLabel(j.trade)}</td>
                              <td>{formatWhen(j.scheduledFor)}</td>
                              <td>{j.tradieName ?? '—'}</td>
                              <td>
                                <JobStatusCell job={j} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <p className="co-help" style={{ marginTop: 8 }}>
                      We remind the tradie 2 hours and 1 hour before, and email you if a booking isn't
                      confirmed or the tradie hasn't set off by the scheduled time.
                    </p>
                  </div>
                )}

                <div className="co-card flush">
                  <div className="co-card-head">
                    <span className="co-card-title">Jobs at your properties</span>
                  </div>
                  {jobs.length === 0 ? (
                    <div className="co-empty">
                      <div className="co-empty-title">No jobs yet</div>
                      <div className="co-empty-sub">
                        Repairs your tenants (or you) raise at managed properties appear here — and
                        you're emailed on every one.
                      </div>
                    </div>
                  ) : (
                    <table className="co-table">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Trade</th>
                          <th>Issue</th>
                          <th>Tradie</th>
                          <th>Raised</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.slice(0, 25).map((j) => (
                          <tr key={j.id}>
                            <td className="co-sub">{j.location.address}</td>
                            <td>{tradeLabel(j.trade)}</td>
                            <td className="co-sub" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {j.description}
                            </td>
                            <td>{j.tradieName ?? '—'}</td>
                            <td>{formatDate(j.timestamps.createdAt)}</td>
                            <td>
                              <JobStatusCell job={j} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ---------------------------------------------------- PANEL -- */}
            {tab === 'panel' && (
              <>
                {inviteBox}

                {panelPending.length > 0 && (
                  <div className="co-card" style={{ marginBottom: 16 }}>
                    <div className="co-sectionhead">
                      Waiting for your approval ({panelPending.length})
                    </div>
                    {panelPending.map((l) =>
                      linkRow(
                        l,
                        <>
                          <button className="co-btn co-btn-primary co-btn-sm" onClick={() => approve(l)}>
                            Approve
                          </button>
                          <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(l)}>
                            Decline
                          </button>
                        </>,
                      ),
                    )}
                  </div>
                )}

                <div className="co-card">
                  <div className="co-sectionhead">Approved tradie panel ({approvedPanel.length})</div>
                  {approvedPanel.length === 0 ? (
                    <p className="co-sub" style={{ fontSize: 13 }}>
                      Nobody yet — send invites above. Only panel members receive jobs at your
                      properties.
                    </p>
                  ) : (
                    approvedPanel.map((l) =>
                      linkRow(
                        l,
                        <>
                          <span className="co-chip co-chip-green">approved</span>
                          <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(l)}>
                            Remove
                          </button>
                        </>,
                      ),
                    )
                  )}
                </div>
              </>
            )}

            {/* ----------------------------------------------- PROPERTIES -- */}
            {tab === 'properties' && (
              <>
                {/* Tenants waiting for confirmation — approving auto-links
                    them to the property they were invited to. */}
                {tenantPending.length > 0 && (
                  <div className="co-card" style={{ marginBottom: 16 }}>
                    <div className="co-sectionhead">
                      Tenants waiting for confirmation ({tenantPending.length})
                    </div>
                    {tenantPending.map((l) =>
                      linkRow(
                        l,
                        <>
                          <button className="co-btn co-btn-primary co-btn-sm" onClick={() => approve(l)}>
                            Confirm
                          </button>
                          <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(l)}>
                            Decline
                          </button>
                        </>,
                      ),
                    )}
                  </div>
                )}

                {/* Confirmed but not linked to any property — their app shows
                    no rental and repairs can't route. Make it unmissable. */}
                {unlinkedTenants.length > 0 && (
                  <div
                    className="co-card"
                    style={{ marginBottom: 16, border: '1px solid #E8B33C', background: '#FFF9EC' }}
                  >
                    <div className="co-sectionhead">
                      ⚠️ Confirmed tenants without a property ({unlinkedTenants.length})
                    </div>
                    <p className="co-help">
                      These tenants confirmed your agency code, but their invite email didn't match
                      any property — so they can't see their rental or raise repairs yet. Link each
                      one below: find their property and type their email into its tenant box
                      (they'll appear in the suggestions).
                    </p>
                    {unlinkedTenants.map((l) => (
                      <div
                        key={l.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
                      >
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>{l.memberName}</span>{' '}
                          <span className="co-sub" style={{ fontSize: 12.5 }}>
                            {l.memberEmail ?? 'no email on file'}
                          </span>
                        </div>
                        <span className="co-chip co-chip-amber">not linked</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="co-card" style={{ marginBottom: 16 }}>
                  <div className="co-sectionhead">Add a property</div>
                  <div className="co-formrow cols-2" style={{ margin: '10px 0' }}>
                    <div className="co-field">
                      <label>Label (optional)</label>
                      <input className="co-input" placeholder="Unit 4, Takapuna" value={label} onChange={(e) => setLabel(e.target.value)} />
                    </div>
                    <div className="co-field">
                      <label>Address</label>
                      <AddressInput
                        value={address}
                        onChange={(v) => {
                          setAddress(v);
                          setCoords(null);
                        }}
                        onSelect={(r) => {
                          setAddress(r.address);
                          setCoords(
                            r.latitude != null && r.longitude != null
                              ? { latitude: r.latitude, longitude: r.longitude }
                              : null,
                          );
                        }}
                      />
                      {coords && (
                        <p className="co-help" style={{ marginTop: 4, color: '#1fb471' }}>
                          ✓ Location pinned — tradies get exact distances
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="co-formrow cols-2" style={{ margin: '0 0 10px' }}>
                    <div className="co-field">
                      <label>Tenant name (optional)</label>
                      <input
                        className="co-input"
                        placeholder="Jane Smith"
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                      />
                    </div>
                    <div className="co-field">
                      <label>Tenant email (optional)</label>
                      <input
                        className="co-input"
                        type="email"
                        placeholder="tenant@email.com"
                        value={newTenantEmail}
                        onChange={(e) => setNewTenantEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  {newTenantEmail.trim() && (
                    <p className="co-help" style={{ marginBottom: 10 }}>
                      They'll get the invite email (app link + your code) and auto-link to this
                      property when they confirm.
                    </p>
                  )}
                  <button className="co-btn co-btn-primary co-btn-sm" disabled={busy || !address.trim()} onClick={addProperty}>
                    {busy ? 'Adding…' : newTenantEmail.trim() ? 'Add property & invite tenant' : 'Add property'}
                  </button>
                </div>

                {/* Bulk import: properties + tenants, invites sent to all. */}
                <div className="co-card" style={{ marginBottom: 16 }}>
                  <div className="co-sectionhead">Import your portfolio</div>
                  <p className="co-help">
                    One row per property: <span className="co-code">label, address, tenantName, tenantEmail</span>.
                    Every tenant with an email gets the invite (app link + your code) and is
                    auto-linked to their property when they confirm.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="co-btn co-btn-ghost co-btn-sm" onClick={downloadTemplate}>
                      Download template
                    </button>
                    <label className="co-btn co-btn-ghost co-btn-sm" style={{ cursor: 'pointer' }}>
                      Choose CSV file
                      <input type="file" accept=".csv" style={{ display: 'none' }} onChange={onImportFile} />
                    </label>
                    {importRows && (
                      <>
                        <span className="co-sub" style={{ fontSize: 13 }}>
                          {importRows.filter((r) => !r.error).length} ready
                          {importRows.some((r) => r.error)
                            ? ` · ${importRows.filter((r) => r.error).length} with issues`
                            : ''}
                        </span>
                        <button
                          className="co-btn co-btn-primary co-btn-sm"
                          disabled={importing || importRows.every((r) => r.error)}
                          onClick={runImport}
                        >
                          {importing
                            ? `Importing… ${importProgress}`
                            : `Import ${importRows.filter((r) => !r.error).length} propert${importRows.filter((r) => !r.error).length === 1 ? 'y' : 'ies'}`}
                        </button>
                        <button className="co-btn co-btn-ghost co-btn-sm" onClick={() => setImportRows(null)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                  {importRows?.some((r) => r.error) && (
                    <p className="co-help" style={{ marginTop: 8, color: '#ef4b5c' }}>
                      Issues: {importRows.filter((r) => r.error).map((r) => `${r.address || '(no address)'} — ${r.error}`).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="co-card">
                  <div className="co-sectionhead">Portfolio ({properties.length})</div>
                  {properties.length === 0 && (
                    <p className="co-sub" style={{ fontSize: 13 }}>
                      No properties yet — add your first one above.
                    </p>
                  )}
                  {properties.map((p) => (
                    <div key={p.id} style={{ marginTop: 14, padding: 14, border: '1px solid var(--line)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{p.label || p.address}</span>
                        {p.label && <span className="co-sub" style={{ fontSize: 12 }}>{p.address}</span>}
                        <span className="co-chip co-chip-blue" style={{ marginLeft: 'auto' }}>
                          {p.tenantIds.length} tenant{p.tenantIds.length === 1 ? '' : 's'}
                        </span>
                        <button className="co-btn co-btn-danger co-btn-sm" onClick={() => deleteProperty(p)}>
                          Remove
                        </button>
                      </div>
                      {p.tenantEmails.map((e, i) => (
                        <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                          <span style={{ flex: 1 }}>👤 {e}</span>
                          <button
                            className="co-btn co-btn-ghost co-btn-sm"
                            onClick={() => unlinkTenant(p, p.tenantIds[i], e)}
                          >
                            Unlink
                          </button>
                        </div>
                      ))}
                      {(p.invitedTenantEmails ?? []).map((e) => (
                        <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                          <span style={{ flex: 1 }}>✉️ {e}</span>
                          <span className="co-chip co-chip-amber">invited</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <input
                          className="co-input"
                          style={{ flex: '1 1 220px' }}
                          list={`tenants-${p.id}`}
                          placeholder="Tenant's email"
                          value={tenantEmail[p.id] ?? ''}
                          onChange={(e) => setTenantEmail((m) => ({ ...m, [p.id]: e.target.value }))}
                        />
                        {/* Confirmed tenants surface as suggestions. */}
                        <datalist id={`tenants-${p.id}`}>
                          {confirmedTenantEmails.map((e) => (
                            <option key={e} value={e} />
                          ))}
                        </datalist>
                        <button
                          className="co-btn co-btn-primary co-btn-sm"
                          disabled={!(tenantEmail[p.id] ?? '').trim()}
                          onClick={() => inviteTenantToProperty(p)}
                        >
                          ✉️ Invite tenant
                        </button>
                        <button
                          className="co-btn co-btn-ghost co-btn-sm"
                          disabled={!(tenantEmail[p.id] ?? '').trim()}
                          onClick={() => linkTenant(p)}
                        >
                          Link existing account
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* --------------------------------------------- REQUEST HELP -- */}
            {tab === 'request' && (
              <AgencyRequestHelp
                agency={agency}
                properties={properties}
                links={links}
                onDispatched={() => setTab('jobs')}
              />
            )}

            {/* ----------------------------------------------------- JOBS -- */}
            {tab === 'jobs' && (
              <div className="co-card flush">
                <div className="co-card-head">
                  <span className="co-card-title">All jobs ({jobs.length})</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      className="co-input"
                      style={{ width: 200 }}
                      value={jobProperty}
                      onChange={(e) => setJobProperty(e.target.value)}
                    >
                      <option value="All">All properties</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.address}>
                          {p.label || p.address}
                        </option>
                      ))}
                    </select>
                    {(['All', 'Live', 'Booked', 'Completed'] as const).map((f) => (
                      <button
                        key={f}
                        className={`co-btn co-btn-sm ${jobFilter === f ? 'co-btn-primary' : 'co-btn-ghost'}`}
                        onClick={() => setJobFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <table className="co-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Trade</th>
                      <th>Issue</th>
                      <th>Tradie</th>
                      <th>Raised</th>
                      <th>On site</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs
                      .filter((j) => {
                        if (jobFilter === 'All') return true;
                        if (jobFilter === 'Booked') return j.status === 'booked';
                        if (jobFilter === 'Live')
                          return ['searching', 'booked', 'confirmed', 'travelling', 'on_site'].includes(
                            j.status,
                          );
                        return j.status === 'completed';
                      })
                      .filter((j) => jobProperty === 'All' || j.location.address === jobProperty)
                      .map((j) => (
                        <tr key={j.id}>
                          <td className="co-sub">{j.location.address}</td>
                          <td>{tradeLabel(j.trade)}</td>
                          <td className="co-sub" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {j.description}
                          </td>
                          <td>{j.tradieName ?? '—'}</td>
                          <td>{formatDate(j.timestamps.createdAt)}</td>
                          <td className="co-num-cell">
                            {j.timestamps.completedAt && j.timestamps.onSiteAt
                              ? formatDuration(j.timestamps.completedAt - j.timestamps.onSiteAt)
                              : '—'}
                          </td>
                          <td>
                            <JobStatusCell job={j} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* -------------------------------------------------- REPORTS -- */}
            {tab === 'reports' && (
              <>
                <div className="co-card" style={{ marginBottom: 16 }}>
                  <div className="co-sectionhead">Per-property maintenance report</div>
                  <p className="co-help">
                    Your deliverable to property owners: everything that happened at their asset —
                    response times, work done, tenant satisfaction. Export and attach it straight to
                    your monthly owner statement.
                  </p>
                  <button
                    className="co-btn co-btn-primary co-btn-sm"
                    disabled={jobs.length === 0}
                    onClick={() => {
                      const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
                      const lines = ['Property,Trade,Issue,Tradie,Raised,Completed,On site (min),Rating,Parts,Parts total ($)'];
                      for (const j of jobs) {
                        const t = j.timestamps;
                        const parts = j.parts ?? [];
                        const partsDesc = parts
                          .map((p) => `${p.description}${p.qty > 1 ? ` x${p.qty}` : ''}`)
                          .join('; ');
                        const partsTotal = parts.reduce((s, p) => s + p.qty * p.unitPriceCents, 0);
                        lines.push(
                          [
                            j.location.address,
                            tradeLabel(j.trade),
                            j.description,
                            j.tradieName ?? '',
                            formatDate(t.createdAt),
                            t.completedAt ? formatDate(t.completedAt) : '',
                            t.completedAt && t.onSiteAt ? String(Math.round((t.completedAt - t.onSiteAt) / 60000)) : '',
                            j.customerRating ? String(j.customerRating.stars) : '',
                            partsDesc,
                            partsTotal ? (partsTotal / 100).toFixed(2) : '',
                          ]
                            .map((v) => esc(String(v)))
                            .join(','),
                        );
                      }
                      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `${agency.name.replace(/\s+/g, '-')}-owner-report-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    ⬇ Export owner report (CSV)
                  </button>
                </div>

                <div className="co-card flush">
                  <div className="co-card-head">
                    <span className="co-card-title">Portfolio summary</span>
                  </div>
                  <table className="co-table">
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Jobs</th>
                        <th>Completed</th>
                        <th>Avg response</th>
                        <th>Avg rating</th>
                        <th>Last job</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((p) => {
                        const pj = jobs.filter((j) => j.location.address === p.address);
                        const done = pj.filter((j) => j.status === 'completed');
                        const responses = pj
                          .map((j) =>
                            j.timestamps.confirmedAt ? j.timestamps.confirmedAt - j.timestamps.createdAt : null,
                          )
                          .filter((x): x is number => x != null);
                        const avgResp = responses.length
                          ? responses.reduce((a, b) => a + b, 0) / responses.length
                          : null;
                        const rated = done.filter((j) => j.customerRating);
                        const avgRating = rated.length
                          ? Math.round((rated.reduce((s, j) => s + (j.customerRating?.stars ?? 0), 0) / rated.length) * 10) / 10
                          : null;
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>{p.label || p.address}</td>
                            <td className="co-num-cell">{pj.length}</td>
                            <td className="co-num-cell">{done.length}</td>
                            <td className="co-num-cell">{avgResp != null ? formatDuration(avgResp) : '—'}</td>
                            <td>{avgRating != null ? `${avgRating} ★` : '—'}</td>
                            <td>{pj[0] ? formatDate(pj[0].timestamps.createdAt) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* -------------------------------------------------- SUPPORT -- */}
            {tab === 'support' && (
              <SupportForm
                from={{ id: agency.id, name: agency.name, email: agency.adminEmail, role: 'agency' }}
              />
            )}

            {/* ------------------------------------------------- SETTINGS -- */}
            {tab === 'settings' && (
              <>
                <div className="co-card" style={{ marginBottom: 16, maxWidth: 620 }}>
                  <div className="co-sectionhead">Agency profile</div>
                  <div className="co-field" style={{ margin: '10px 0 14px' }}>
                    <label>Agency name</label>
                    <input className="co-input" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
                  </div>
                  <button
                    className="co-btn co-btn-primary co-btn-sm"
                    disabled={savingName || !agencyName.trim()}
                    onClick={async () => {
                      setSavingName(true);
                      await updateAgencyName(agency.id, agencyName);
                      setSavingName(false);
                      flash('Saved ✓ — refresh to see it everywhere');
                    }}
                  >
                    {savingName ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
                <div className="co-card" style={{ maxWidth: 620 }}>
                  <div className="co-sectionhead">Account</div>
                  <table className="co-table">
                    <tbody>
                      <tr>
                        <td className="co-sub">Admin email</td>
                        <td style={{ fontWeight: 600 }}>{agency.adminEmail}</td>
                      </tr>
                      <tr>
                        <td className="co-sub">Agent code</td>
                        <td>
                          <span className="co-code">{agency.code}</span>{' '}
                          <button className="co-btn co-btn-ghost co-btn-sm" onClick={copyCode}>Copy</button>
                        </td>
                      </tr>
                      <tr>
                        <td className="co-sub">Agency ID</td>
                        <td>
                          <span className="co-code">{agency.id}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="co-toast">{toast}</div>}
    </div>
  );
}
