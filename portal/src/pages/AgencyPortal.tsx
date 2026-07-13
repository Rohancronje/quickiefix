import { useCallback, useEffect, useState } from 'react';
import {
  addAgencyProperty,
  approveAgencyLink,
  linkTenantByEmail,
  listAgencyProperties,
  listPanel,
  removeAgencyLink,
  unlinkTenant,
} from '../agencyApi';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth';
import { confirmDialog } from '../components/confirm';
import { functions } from '../firebase';
import { Agency, AgencyLink, Property } from '../types';

const KIND_LABEL: Record<AgencyLink['kind'], string> = {
  tradie: 'Individual tradie',
  company: 'Trade company (covers their team)',
  tenant: 'Tenant',
};

const LINK_CHIP: Record<AgencyLink['status'], string> = {
  pending: 'co-chip-amber',
  approved: 'co-chip-green',
  removed: 'co-chip-grey',
};

/** Property-agency portal: agent code, approved tradie panel, portfolio. */
export function AgencyPortal({ agency }: { agency: Agency }) {
  const { logout } = useAuth();
  const [links, setLinks] = useState<AgencyLink[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // Add-property form
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  // Per-property tenant email inputs
  const [tenantEmail, setTenantEmail] = useState<Record<string, string>>({});
  // Email invites (app link + agency code)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteKind, setInviteKind] = useState<'tenant' | 'tradie'>('tenant');
  const [inviting, setInviting] = useState(false);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const refresh = useCallback(async () => {
    const [l, p] = await Promise.all([listPanel(agency.id), listAgencyProperties(agency.adminUserId)]);
    setLinks(l);
    setProperties(p);
    setLoading(false);
  }, [agency.id, agency.adminUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = async (l: AgencyLink) => {
    const message =
      l.kind === 'tenant'
        ? 'Confirms them as your tenant. Then add them to their property below — their repair requests will route to your approved tradies.'
        : `${l.kind === 'company' ? `Covers their ${l.scope === 'employees' ? 'employees (contractors excluded)' : 'whole team'}. ` : ''}Jobs at your properties will dispatch to them, on your agency's commercial terms.`;
    if (
      !(await confirmDialog(
        `${l.kind === 'tenant' ? 'Confirm' : 'Approve'} ${l.memberName}?`,
        { message, confirmLabel: l.kind === 'tenant' ? 'Confirm tenant' : 'Approve' },
      ))
    )
      return;
    try {
      await approveAgencyLink(l.id);
      await refresh();
      flash(`${l.memberName} approved ✓`);
    } catch (e) {
      flash(`Could not approve: ${(e as Error).message}`);
    }
  };

  const remove = async (l: AgencyLink) => {
    if (
      !(await confirmDialog(`Remove ${l.memberName} from your panel?`, {
        message: 'They stop receiving jobs at your properties immediately.',
        confirmLabel: 'Remove',
        danger: true,
      }))
    )
      return;
    try {
      await removeAgencyLink(l.id);
      await refresh();
      flash('Removed from panel');
    } catch (e) {
      flash(`Could not remove: ${(e as Error).message}`);
    }
  };

  const addProperty = async () => {
    if (!address.trim()) return;
    setBusy(true);
    await addAgencyProperty(agency, { label, address });
    setLabel('');
    setAddress('');
    setBusy(false);
    await refresh();
    flash('Property added');
  };

  const linkTenant = async (p: Property) => {
    const email = (tenantEmail[p.id] ?? '').trim();
    if (!email) return;
    try {
      await linkTenantByEmail(p, email);
      setTenantEmail((m) => ({ ...m, [p.id]: '' }));
      await refresh();
      flash('Tenant linked ✓');
    } catch (e) {
      flash((e as Error).message);
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
      await httpsCallable(functions, 'sendAgencyInvite')({ email: inviteEmail, kind: inviteKind });
      setInviteEmail('');
      flash(`Invite sent to ${inviteEmail.trim()} ✓`);
    } catch (e) {
      flash(`Could not send: ${(e as Error).message}`);
    } finally {
      setInviting(false);
    }
  };

  const pending = links.filter((l) => l.status === 'pending');
  const approved = links.filter((l) => l.status === 'approved');

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 80px' }}>
      {/* Header */}
      <div className="co-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>🏢 {agency.name}</div>
            <div className="co-sub" style={{ marginTop: 2 }}>
              Property agency · {agency.adminEmail}
            </div>
          </div>
          <button className="co-btn co-btn-ghost co-btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="co-sub">Your agent code:</span>
          <span className="co-code" style={{ fontSize: 18, letterSpacing: 1 }}>{agency.code}</span>
          <button className="co-btn co-btn-ghost co-btn-sm" onClick={copyCode}>Copy</button>
        </div>
        <p className="co-sub" style={{ fontSize: 13, marginTop: 8 }}>
          Tradies enter it in the app (Profile → Property agents), trade companies in the portal
          (Settings), tenants in the app (Account → Property manager). Approve them below — jobs at
          your properties then dispatch only to your approved panel, with rates handled by your own
          agreements.
        </p>

        {/* Email invite: app link + code + role-specific instructions. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="co-input"
            style={{ flex: '1 1 220px' }}
            placeholder="name@email.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="co-input"
            style={{ width: 150 }}
            value={inviteKind}
            onChange={(e) => setInviteKind(e.target.value as 'tenant' | 'tradie')}
          >
            <option value="tenant">Tenant</option>
            <option value="tradie">Tradie / company</option>
          </select>
          <button
            className="co-btn co-btn-primary co-btn-sm"
            disabled={inviting || !inviteEmail.trim()}
            onClick={sendInvite}
          >
            {inviting ? 'Sending…' : '✉️ Send invite'}
          </button>
        </div>
        <p className="co-sub" style={{ fontSize: 12, marginTop: 6 }}>
          The invite email carries the app download link, your code, and step-by-step instructions.
        </p>
      </div>

      {/* Panel */}
      <div className="co-card" style={{ marginBottom: 16 }}>
        <div className="co-sectionhead">Approved tradie panel</div>
        {pending.length > 0 && (
          <>
            <div className="co-sub" style={{ fontWeight: 700, margin: '10px 0 6px' }}>
              Waiting for your approval
            </div>
            {pending.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{l.memberName}</div>
                  <div className="co-sub" style={{ fontSize: 12 }}>
                    {KIND_LABEL[l.kind]}
                    {l.kind === 'company' && l.scope === 'employees' ? ' · employees only' : ''}
                    {l.memberEmail ? ` · ${l.memberEmail}` : ''}
                  </div>
                </div>
                <button className="co-btn co-btn-primary co-btn-sm" onClick={() => approve(l)}>Approve</button>
                <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(l)}>Decline</button>
              </div>
            ))}
          </>
        )}
        <div className="co-sub" style={{ fontWeight: 700, margin: '12px 0 6px' }}>
          On your panel ({approved.length})
        </div>
        {approved.length === 0 ? (
          <p className="co-sub" style={{ fontSize: 13 }}>
            Nobody yet — share your agent code with the tradies and companies you trust.
          </p>
        ) : (
          approved.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{l.memberName}</div>
                <div className="co-sub" style={{ fontSize: 12 }}>
                  {KIND_LABEL[l.kind]}
                  {l.kind === 'company' && l.scope === 'employees' ? ' · employees only' : ''}
                  {l.memberEmail ? ` · ${l.memberEmail}` : ''}
                  {l.kind === 'tenant' ? ' — add them to their property below' : ''}
                </div>
              </div>
              <span className={`co-chip ${LINK_CHIP[l.status]}`}>approved</span>
              <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(l)}>Remove</button>
            </div>
          ))
        )}
      </div>

      {/* Properties */}
      <div className="co-card">
        <div className="co-sectionhead">Portfolio ({properties.length})</div>
        <div className="co-formrow cols-2" style={{ margin: '10px 0' }}>
          <div className="co-field">
            <label>Label (optional)</label>
            <input className="co-input" placeholder="Unit 4, Takapuna" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="co-field">
            <label>Address</label>
            <input className="co-input" placeholder="12 Queen Street, Auckland" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <button className="co-btn co-btn-primary co-btn-sm" disabled={busy || !address.trim()} onClick={addProperty}>
          Add property
        </button>

        {properties.map((p) => (
          <div key={p.id} style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700 }}>{p.label || p.address}</div>
            {p.label && <div className="co-sub" style={{ fontSize: 12 }}>{p.address}</div>}
            <div className="co-sub" style={{ fontSize: 12, margin: '6px 0' }}>
              {p.tenantIds.length} tenant{p.tenantIds.length === 1 ? '' : 's'} linked
            </div>
            {p.tenantEmails.map((e, i) => (
              <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
                <span style={{ flex: 1 }}>👤 {e}</span>
                <button className="co-btn co-btn-ghost co-btn-sm" onClick={() => unlinkTenant(p, p.tenantIds[i], e).then(refresh)}>
                  Unlink
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="co-input"
                style={{ flex: 1 }}
                placeholder="Tenant's QuickieFix email"
                value={tenantEmail[p.id] ?? ''}
                onChange={(e) => setTenantEmail((m) => ({ ...m, [p.id]: e.target.value }))}
              />
              <button className="co-btn co-btn-primary co-btn-sm" onClick={() => linkTenant(p)}>
                Link tenant
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && <div className="co-toast">{toast}</div>}
    </div>
  );
}
