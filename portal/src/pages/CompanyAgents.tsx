import { useMemo, useState } from 'react';
import { companyAgencyLinksQuery, requestCompanyAgencyLink } from '../agencyApi';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { AgencyLink } from '../types';

/**
 * Property-agent panels: recurring, exclusive demand — the growth engine for
 * a trade company. Join with an agent code; jobs at the agency's managed
 * properties then dispatch to your team.
 */
export function CompanyAgents() {
  const { company } = useAuth();
  const cid = company?.id ?? '';
  const linksLive = useLive<AgencyLink>(`companyAgencyLinks:${cid}`, () =>
    companyAgencyLinksQuery(cid),
  );
  const links = useMemo(
    () =>
      (linksLive ?? [])
        .filter((l) => l.status !== 'removed')
        .sort((a, b) => b.requestedAt - a.requestedAt),
    [linksLive],
  );
  const [code, setCode] = useState('');
  const [scope, setScope] = useState<'all' | 'employees'>('all');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const join = async () => {
    if (!company || !code.trim()) return;
    setBusy(true);
    try {
      const name = await requestCompanyAgencyLink(company, code, scope);
      setCode('');
      flash(`Request sent to ${name} — pending their approval`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="co-card" style={{ marginBottom: 16, maxWidth: 720 }}>
        <div className="co-sectionhead">Why panels matter</div>
        <p className="co-help" style={{ fontSize: 13.5 }}>
          Property agencies route ALL repairs at their managed portfolios to their approved panel —
          recurring work your competitors never see. Ask your property-manager contacts for their
          QuickieFix agent code, enter it below, and your team starts receiving those jobs the
          moment they approve you.
        </p>
      </div>

      <div className="co-card" style={{ marginBottom: 16, maxWidth: 720 }}>
        <div className="co-sectionhead">Join a panel</div>
        <div style={{ display: 'flex', gap: 14, margin: '10px 0 6px', fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            Whole team
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={scope === 'employees'} onChange={() => setScope('employees')} />
            Employees only (no contractors)
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="co-input"
            style={{ flex: 1 }}
            placeholder="Agent code (e.g. QF-AG-7K2P)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="co-btn co-btn-primary co-btn-sm" disabled={busy || !code.trim()} onClick={join}>
            {busy ? 'Sending…' : 'Join panel'}
          </button>
        </div>
      </div>

      <div className="co-card" style={{ maxWidth: 720 }}>
        <div className="co-sectionhead">Your panels ({links.length})</div>
        {links.length === 0 ? (
          <p className="co-sub" style={{ fontSize: 13 }}>
            None yet — each approved panel is a stream of exclusive property-maintenance work.
          </p>
        ) : (
          links.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{l.agencyName}</div>
                <div className="co-sub" style={{ fontSize: 12 }}>
                  {l.scope === 'employees' ? 'Employees only' : 'Whole team'}
                </div>
              </div>
              <span className={`co-chip ${l.status === 'approved' ? 'co-chip-green' : 'co-chip-amber'}`}>
                {l.status}
              </span>
            </div>
          ))
        )}
      </div>

      {toast && <div className="co-toast">{toast}</div>}
    </>
  );
}
