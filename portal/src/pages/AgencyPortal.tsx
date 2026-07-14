import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
import {
  addAgencyProperty,
  approveAgencyLink,
  confirmTenantLink,
  linkTenantByEmail,
  listAgencyJobs,
  listAgencyProperties,
  listPanel,
  parsePortfolioCsv,
  PORTFOLIO_TEMPLATE,
  PortfolioRow,
  recordTenantInvite,
  removeAgencyLink,
  unlinkTenant,
} from '../agencyApi';
import { AddressInput } from '../components/AddressInput';
import { useAuth } from '../auth';
import { confirmDialog } from '../components/confirm';
import { functions } from '../firebase';
import {
  IconBriefcase,
  IconCheck,
  IconCompanies,
  IconLogout,
  IconOverview,
  IconTradies,
} from '../backoffice/icons';
import { formatDate } from '../lib';
import { Agency, AgencyLink, Job, Property, tradeLabel } from '../types';

type Tab = 'dashboard' | 'panel' | 'properties';

const KIND_LABEL: Record<AgencyLink['kind'], string> = {
  tradie: 'Individual tradie',
  company: 'Trade company (covers their team)',
  tenant: 'Tenant',
};

const STATUS_CHIP: Record<string, string> = {
  searching: 'co-chip-amber',
  confirmed: 'co-chip-blue',
  travelling: 'co-chip-blue',
  on_site: 'co-chip-blue',
  completed: 'co-chip-green',
  cancelled: 'co-chip-grey',
  no_tradie_found: 'co-chip-amber',
};

/** Property-agency portal: dashboard, approved panel, portfolio. */
export function AgencyPortal({ agency }: { agency: Agency }) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [links, setLinks] = useState<AgencyLink[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // Add-property form
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
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

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const refresh = useCallback(async () => {
    const [l, p, j] = await Promise.all([
      listPanel(agency.id),
      listAgencyProperties(agency.adminUserId),
      listAgencyJobs(agency.id),
    ]);
    setLinks(l);
    setProperties(p);
    setJobs(j);
    setLoading(false);
  }, [agency.id, agency.adminUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = links.filter((l) => l.status === 'pending');
  const panelPending = pending.filter((l) => l.kind !== 'tenant');
  const tenantPending = pending.filter((l) => l.kind === 'tenant');
  const approved = links.filter((l) => l.status === 'approved');
  const approvedPanel = approved.filter((l) => l.kind !== 'tenant');
  const approvedTenants = approved.filter((l) => l.kind === 'tenant');
  const confirmedTenantEmails = approvedTenants.map((l) => l.memberEmail).filter(Boolean) as string[];
  const tenantsLinked = properties.reduce((s, p) => s + p.tenantIds.length, 0);
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;
  const activeJobs = jobs.filter((j) =>
    ['searching', 'confirmed', 'travelling', 'on_site'].includes(j.status),
  ).length;

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
        await refresh();
        flash(
          matched
            ? `${l.memberName} confirmed — linked to ${matched} ✓`
            : `${l.memberName} confirmed — no matching invite, link them to a property manually`,
        );
      } else {
        await approveAgencyLink(l.id);
        await refresh();
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
      await refresh();
      flash('Removed');
    } catch (e) {
      flash(`Could not remove: ${(e as Error).message}`);
    }
  };

  const addProperty = async () => {
    if (!address.trim()) return;
    setBusy(true);
    try {
      await addAgencyProperty(agency, { label, address, ...(coords ?? {}) });
      setLabel('');
      setAddress('');
      setCoords(null);
      await refresh();
      flash('Property added ✓');
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
      await refresh();
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
      await refresh();
      flash(`Invite sent to ${email} — they'll auto-link to ${p.label || p.address} on confirm ✓`);
    } catch (e) {
      flash(`Could not invite: ${(e as Error).message}`);
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
    await refresh();
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
    { key: 'panel', label: 'Tradie panel', Icon: IconTradies },
    { key: 'properties', label: 'Properties', Icon: IconBriefcase },
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

  const activated = completedJobs > 0 || activeJobs > 0;
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
            {tab === 'dashboard'
              ? `Welcome back, ${agency.name} 👋`
              : tab === 'panel'
                ? 'Tradie panel & invites'
                : 'Properties & tenants'}
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
                              <span className={`co-chip ${STATUS_CHIP[j.status] ?? 'co-chip-grey'}`}>
                                {j.status.replace(/_/g, ' ')}
                              </span>
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
                  <button className="co-btn co-btn-primary co-btn-sm" disabled={busy || !address.trim()} onClick={addProperty}>
                    Add property
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
                      </div>
                      {p.tenantEmails.map((e, i) => (
                        <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                          <span style={{ flex: 1 }}>👤 {e}</span>
                          <button
                            className="co-btn co-btn-ghost co-btn-sm"
                            onClick={() => unlinkTenant(p, p.tenantIds[i], e).then(refresh)}
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
          </div>
        </div>
      </div>

      {toast && <div className="co-toast">{toast}</div>}
    </div>
  );
}
