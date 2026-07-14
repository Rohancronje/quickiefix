import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db, functions } from '../firebase';
import { useLive } from '../live';
import { AgencyLink, Agency, Property, Tradie, TRADE_LABELS, tradeLabel } from '../types';

/**
 * "The tenant just called us with a fault" — the property manager raises the
 * job right here: pick the property (+ tenant), describe the issue, see which
 * approved tradies are available NOW, and dispatch. The job is stamped to the
 * tenant, so live tracking appears in their app while they're on the phone.
 */

const havKm = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

interface TenantOption {
  id: string;
  name: string;
}

export function AgencyRequestHelp({
  agency,
  properties,
  links,
  onDispatched,
}: {
  agency: Agency;
  properties: Property[];
  links: AgencyLink[];
  onDispatched: () => void;
}) {
  const [propertyId, setPropertyId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [trade, setTrade] = useState('');
  const [description, setDescription] = useState('');
  const [preferred, setPreferred] = useState(''); // '' = best match (auto)
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const property = properties.find((p) => p.id === propertyId);

  // Tenant names for the selected property (ids live on the property doc).
  useEffect(() => {
    setTenants([]);
    setTenantId('');
    if (!property) return;
    let live = true;
    void Promise.all(
      property.tenantIds.map(async (id) => {
        const snap = await getDoc(doc(db, 'users', id));
        const d = snap.data() as { firstName?: string; lastName?: string } | undefined;
        return { id, name: d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() : 'Tenant' };
      }),
    ).then((t) => {
      if (!live) return;
      setTenants(t);
      if (t.length === 1) setTenantId(t[0].id);
    });
    return () => {
      live = false;
    };
  }, [property]);

  // Live availability: who on the approved panel could take this job right now.
  const availableLive = useLive<Tradie>('available:tradies', () =>
    query(collection(db, 'users'), where('status', '==', 'available')),
  );
  const panel = useMemo(() => {
    const approved = links.filter((l) => l.status === 'approved' && l.kind !== 'tenant');
    return {
      tradieIds: approved.filter((l) => l.kind === 'tradie').map((l) => l.memberId),
      companyScope: Object.fromEntries(
        approved.filter((l) => l.kind === 'company').map((l) => [l.memberId, l.scope ?? 'all']),
      ) as Record<string, 'all' | 'employees'>,
    };
  }, [links]);

  const available = useMemo(() => {
    if (!trade) return [];
    const here =
      property?.latitude != null && property?.longitude != null
        ? { latitude: property.latitude, longitude: property.longitude }
        : null;
    return (availableLive ?? [])
      .filter((u) => u.role === 'tradie' && u.approval === 'approved' && !u.paymentHold)
      .filter((u) => [u.primaryTrade, ...(u.secondaryTrades ?? [])].includes(trade as never))
      .filter((u) => {
        if (panel.tradieIds.includes(u.id)) return true;
        if (!u.companyId) return false;
        const scope = panel.companyScope[u.companyId];
        return !!scope && (scope === 'all' || u.engagement !== 'contractor');
      })
      .map((u) => ({
        u,
        km: here && u.baseLocation ? havKm(u.baseLocation, here) : null,
      }))
      .sort((a, b) => (a.km ?? 999) - (b.km ?? 999) || b.u.ratingAvg - a.u.ratingAvg);
  }, [availableLive, trade, property, panel]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  const dispatch = async () => {
    if (!property || !trade || !description.trim()) return;
    setBusy(true);
    try {
      const res = await httpsCallable(functions, 'createAgencyJob')({
        propertyId: property.id,
        trade,
        description,
        tenantId: tenantId || undefined,
        preferredTradieId: preferred || undefined,
      });
      const d = res.data as { candidateCount: number; customerName: string };
      setDescription('');
      setPreferred('');
      flash(
        `Dispatched ✓ — ${d.candidateCount} tradie${d.candidateCount === 1 ? '' : 's'} pinged. ${
          tenantId ? `${d.customerName} can track it live in their app.` : ''
        }`,
      );
      setTimeout(onDispatched, 1200);
    } catch (e) {
      flash(`Could not dispatch: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const canDispatch = !!property && !!trade && description.trim().length >= 5 && !busy;

  return (
    <>
      <div className="co-card" style={{ marginBottom: 16, maxWidth: 760 }}>
        <div className="co-sectionhead">🚨 Request help at a property</div>
        <p className="co-help">
          Tenant on the phone with a fault? Raise it here — the job goes straight to your approved
          tradies, and the tenant sees live tracking in their app.
        </p>

        <div className="co-formrow cols-2" style={{ margin: '12px 0' }}>
          <div className="co-field">
            <label>Property</label>
            <select
              className="co-input"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.address}
                </option>
              ))}
            </select>
          </div>
          <div className="co-field">
            <label>Tenant (customer of record)</label>
            <select
              className="co-input"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={!property || tenants.length === 0}
            >
              {tenants.length === 0 ? (
                <option value="">
                  {property ? 'No tenant linked — job is raised as the agency' : '—'}
                </option>
              ) : (
                tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="co-formrow cols-2" style={{ marginBottom: 12 }}>
          <div className="co-field">
            <label>What kind of tradie?</label>
            <select className="co-input" value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="">Select a trade…</option>
              {Object.entries(TRADE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="co-field">
            <label>Describe the fault</label>
            <textarea
              className="co-input"
              rows={2}
              placeholder="Hot water cylinder leaking in the garage…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Live availability, panel-only — pick a specific tradie or best match. */}
        {trade && property && (
          <div style={{ marginBottom: 14 }}>
            <div className="co-sectionhead" style={{ fontSize: 13 }}>
              Available now on your panel ({available.length})
            </div>
            {available.length === 0 ? (
              <p className="co-sub" style={{ fontSize: 13 }}>
                None of your approved {tradeLabel(trade).toLowerCase()}s are online right now — you
                can still dispatch, and they're pinged the moment they're back.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}
                >
                  <input type="radio" checked={preferred === ''} onChange={() => setPreferred('')} />
                  <span style={{ fontWeight: 600 }}>⚡ Best match</span>
                  <span className="co-sub" style={{ fontSize: 12.5 }}>
                    nearest available first, auto-escalates
                  </span>
                </label>
                {available.map(({ u, km }) => (
                  <label
                    key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      checked={preferred === u.id}
                      onChange={() => setPreferred(u.id)}
                    />
                    <span style={{ fontWeight: 600 }}>{u.businessName}</span>
                    <span className="co-sub" style={{ fontSize: 12.5 }}>
                      {u.firstName} {u.lastName}
                      {u.companyName ? ` · ${u.companyName}` : ''}
                      {u.ratingCount > 0 ? ` · ⭐ ${u.ratingAvg.toFixed(1)} (${u.ratingCount})` : ''}
                      {km != null ? ` · ${km.toFixed(0)} km away` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="co-btn co-btn-primary" disabled={!canDispatch} onClick={dispatch}>
          {busy ? 'Dispatching…' : preferred ? 'Dispatch this tradie' : 'Dispatch best match'}
        </button>
        {properties.length === 0 && (
          <p className="co-help" style={{ marginTop: 8 }}>
            Add a property first (Properties tab) — jobs are always raised against a property.
          </p>
        )}
        <p className="co-help" style={{ marginTop: 8 }}>
          Dispatching as {agency.name}: rates are covered by your agency agreement, and the job
          lands on your Jobs tab and owner reports automatically.
        </p>
      </div>
      {toast && <div className="co-toast">{toast}</div>}
    </>
  );
}
