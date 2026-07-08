import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createInvite,
  listCompanyTradies,
  listInvites,
  removeTradie,
  revokeInvite,
} from '../api';
import { useAuth } from '../auth';
import {
  downloadTemplate,
  importTradies,
  ImportResult,
  ImportRow,
  parseImportCsv,
  VALID_TRADES,
} from '../importApi';
import { initials } from '../lib';
import { Company, CompanyInvite, Tradie, tradeLabel } from '../types';

export function Team() {
  const { company } = useAuth();
  const nav = useNavigate();
  const [tradies, setTradies] = useState<Tradie[]>([]);
  const [invites, setInvites] = useState<CompanyInvite[]>([]);
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Spreadsheet import
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    const text = await file.text();
    setRows(parseImportCsv(text));
    e.target.value = '';
  };

  const runImport = async () => {
    if (!company || !rows) return;
    setImporting(true);
    setProgress(0);
    const res = await importTradies(company, rows, (d) => setProgress(d));
    setResults(res);
    setRows(null);
    setImporting(false);
    await refresh(company);
    flash(`Imported ${res.filter((r) => r.ok).length} tradie(s)`);
  };

  const refresh = async (c: Company) => {
    const [t, i] = await Promise.all([listCompanyTradies(c.id), listInvites(c.id)]);
    setTradies(t);
    setInvites(i.filter((x) => !x.redeemedBy));
  };

  useEffect(() => {
    if (company) void refresh(company);
  }, [company]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const inviteMessage = (inv: CompanyInvite) =>
    `You've been invited to join ${inv.companyName} on QuickieFix.\n` +
    `In the app: Profile → Company → Join a company → enter code:\n${inv.token}`;

  const copyInvite = (inv: CompanyInvite) => {
    void navigator.clipboard.writeText(inviteMessage(inv));
    flash('Invite copied to clipboard');
  };

  const generateOne = async () => {
    if (!company) return;
    setBusy(true);
    await createInvite(company);
    await refresh(company);
    setBusy(false);
    flash('Invite created');
  };

  const generateBulk = async () => {
    if (!company) return;
    const emails = bulk
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setBusy(true);
    for (const email of emails) await createInvite(company, email);
    setBulk('');
    await refresh(company);
    setBusy(false);
    flash(`${emails.length} invite${emails.length > 1 ? 's' : ''} created`);
  };

  const remove = async (t: Tradie) => {
    if (!company) return;
    if (!confirm(`Remove ${t.firstName} ${t.lastName} from ${company.name}?`)) return;
    await removeTradie(t.id);
    await refresh(company);
    flash('Tradie removed');
  };

  const revoke = async (inv: CompanyInvite) => {
    if (!company) return;
    await revokeInvite(inv.token);
    await refresh(company);
    flash('Invite revoked');
  };

  return (
    <div className="grid" style={{ gap: 24 }}>
      {/* Current tradies */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-title" style={{ padding: '18px 22px', margin: 0 }}>
          Tradies in {company?.name} ({tradies.length})
        </div>
        {tradies.length === 0 ? (
          <div className="empty">
            <div className="e-ico">🧰</div>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>No tradies linked yet</p>
            <p>Create an invite below and send the code to your tradies.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tradie</th>
                <th>Trade</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tradies.map((t) => (
                <tr key={t.id}>
                  <td className="row-link" onClick={() => nav(`/tradie/${t.id}`)}>
                    <div className="flex">
                      <div className="avatar">{initials(t.firstName, t.lastName)}</div>
                      <div style={{ fontWeight: 700 }}>
                        {t.firstName} {t.lastName}
                      </div>
                    </div>
                  </td>
                  <td>{tradeLabel(t.primaryTrade)}</td>
                  <td className="faint">{t.email}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="section-title">Invite a tradie</div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Generate a one-time code. Your tradie enters it in the app to link to your company.
          </p>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={generateOne}>
            + Generate invite code
          </button>
        </div>

        <div className="card">
          <div className="section-title">Bulk invite</div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            Paste emails (one per line) to generate an invite for each.
          </p>
          <div className="field">
            <textarea
              rows={4}
              placeholder={'mike@lazer.co.nz\nsara@lazer.co.nz'}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary btn-block" disabled={busy || !bulk.trim()} onClick={generateBulk}>
            Generate invites
          </button>
        </div>
      </div>

      {/* Spreadsheet import */}
      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Import from a spreadsheet
          </div>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            ⬇ Download template
          </button>
        </div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
          Download the template, fill in your tradies, then upload it. Each tradie gets an account
          linked to {company?.name} and an email to set their password. Valid trades:{' '}
          <span className="faint">{VALID_TRADES.join(', ')}</span>.
        </p>

        {!importing && !results && (
          <label className="btn btn-secondary btn-sm" style={{ display: 'inline-block' }}>
            📄 Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}

        {/* Preview parsed rows */}
        {rows && !importing && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 10 }}>
              {rows.filter((r) => !r._error).length} ready ·{' '}
              <span style={{ color: 'var(--danger)' }}>
                {rows.filter((r) => r._error).length} with issues
              </span>
            </p>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
              <table>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="faint">{r.email}</td>
                      <td>{tradeLabel(r.primaryTrade)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r._error ? (
                          <span className="badge badge-gray" style={{ color: 'var(--danger)' }}>
                            {r._error}
                          </span>
                        ) : (
                          <span className="badge badge-green">ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex" style={{ gap: 10, marginTop: 14 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={rows.filter((r) => !r._error).length === 0}
                onClick={runImport}
              >
                Import {rows.filter((r) => !r._error).length} tradie(s)
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRows(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {importing && (
          <div className="flex" style={{ gap: 12, marginTop: 16 }}>
            <div className="spinner" />
            <span className="muted">Creating accounts &amp; sending emails… {progress}</span>
          </div>
        )}

        {results && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 10 }}>
              {results.filter((r) => r.ok).length} imported ·{' '}
              {results.filter((r) => !r.ok).length} skipped
            </p>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} className="between" style={{ padding: '6px 0' }}>
                  <span className="faint">{r.email}</span>
                  <span className={`badge ${r.ok ? 'badge-green' : 'badge-gray'}`}>{r.message}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setResults(null)}>
              Done
            </button>
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="section-title" style={{ padding: '18px 22px', margin: 0 }}>
            Pending invites ({invites.length})
          </div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>For</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.token}>
                  <td>
                    <span className="pill-code">{inv.token}</span>
                  </td>
                  <td className="faint">{inv.email ?? 'Anyone with the code'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => copyInvite(inv)}>
                      Copy invite
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => revoke(inv)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
