import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { issueTag, listCompanyTags, listCompanyTradies, removeTag } from '../api';
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
import { Company, CompanyTag, CompanyTagStatus, Tradie, tradeLabel } from '../types';

const TAG_BADGE: Record<CompanyTagStatus, string> = {
  issued: 'badge-amber',
  claimed: 'badge-blue',
  validated: 'badge-green',
  removed: 'badge-gray',
};

export function Team() {
  const { company } = useAuth();
  const nav = useNavigate();
  const [tradies, setTradies] = useState<Tradie[]>([]);
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Add-seat form
  const [seatName, setSeatName] = useState('');
  const [seatEmail, setSeatEmail] = useState('');
  const [seatPhone, setSeatPhone] = useState('');
  const [lastTag, setLastTag] = useState<CompanyTag | null>(null);
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
    const [t, tg] = await Promise.all([listCompanyTradies(c.id), listCompanyTags(c.id)]);
    setTradies(t);
    setTags(tg);
  };

  useEffect(() => {
    if (company) void refresh(company);
  }, [company]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const addSeat = async () => {
    if (!company || !seatName.trim() || !seatEmail.trim()) return;
    setBusy(true);
    const tag = await issueTag(company, {
      name: seatName,
      email: seatEmail,
      phone: seatPhone || undefined,
    });
    setLastTag(tag);
    setSeatName('');
    setSeatEmail('');
    setSeatPhone('');
    await refresh(company);
    setBusy(false);
    flash('Seat added — share the code');
  };

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    flash('Code copied to clipboard');
  };

  const remove = async (tag: CompanyTag) => {
    if (!company) return;
    if (!confirm(`Remove the seat for ${tag.issuedToName}?`)) return;
    await removeTag(tag.id);
    await refresh(company);
    flash('Seat removed');
  };

  // Roster = validated members. Union users bound to the company with validated
  // tags (deduped by the claiming user id / email).
  const validatedTags = tags.filter((t) => t.status === 'validated');
  const rosterIds = new Set(tradies.map((t) => t.id));
  const extraValidated = validatedTags.filter(
    (t) => !t.claimedByUserId || !rosterIds.has(t.claimedByUserId),
  );
  const rosterCount = tradies.length + extraValidated.length;

  return (
    <div className="grid" style={{ gap: 24 }}>
      {/* Roster (validated members) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-title" style={{ padding: '18px 22px', margin: 0 }}>
          Tradies in {company?.name} ({rosterCount})
        </div>
        {rosterCount === 0 ? (
          <div className="empty">
            <div className="e-ico">🧰</div>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>No validated tradies yet</p>
            <p>Add a seat below and send the code to your tradie.</p>
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
                  <td style={{ textAlign: 'right' }} />
                </tr>
              ))}
              {extraValidated.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <div className="flex">
                      <div className="avatar">{initials(tag.issuedToName, '')}</div>
                      <div style={{ fontWeight: 700 }}>{tag.issuedToName}</div>
                    </div>
                  </td>
                  <td className="faint">—</td>
                  <td className="faint">{tag.issuedToEmail}</td>
                  <td style={{ textAlign: 'right' }} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add seat */}
      <div className="card">
        <div className="section-title">Add a seat</div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Issue a tag for a tradie. They enter the code in the app to claim their seat; a platform
          admin then validates it.
        </p>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Name</label>
            <input value={seatName} onChange={(e) => setSeatName(e.target.value)} placeholder="Mike Jones" />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={seatEmail} onChange={(e) => setSeatEmail(e.target.value)} placeholder="mike@lazer.co.nz" />
          </div>
          <div className="field">
            <label>Phone (optional)</label>
            <input value={seatPhone} onChange={(e) => setSeatPhone(e.target.value)} placeholder="021 234 5678" />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !seatName.trim() || !seatEmail.trim()}
          onClick={addSeat}
        >
          + Add seat
        </button>

        {lastTag && (
          <div
            className="card"
            style={{ marginTop: 16, background: 'var(--amber-soft, #FFF7E6)', padding: 16 }}
          >
            <p style={{ fontWeight: 700, marginBottom: 8 }}>
              Tag issued for {lastTag.issuedToName}
            </p>
            <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
              <span className="pill-code" style={{ fontSize: 20, letterSpacing: 1 }}>
                {lastTag.code}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => copyCode(lastTag.code)}>
                Copy code
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Send this code to the tradie. It expires in 14 days.
            </p>
          </div>
        )}
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
          linked to {company?.name} (with a pre-validated tag) and an email to set their password.
          Valid trades: <span className="faint">{VALID_TRADES.join(', ')}</span>.
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

      {/* Tag roster */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-title" style={{ padding: '18px 22px', margin: 0 }}>
          Tags ({tags.length})
        </div>
        {tags.length === 0 ? (
          <div className="empty">
            <div className="e-ico">🏷️</div>
            <p>No tags issued yet.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Issued to</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <span className="pill-code">{tag.code}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{tag.issuedToName}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {tag.issuedToEmail}
                      {tag.issuedToPhone ? ` · ${tag.issuedToPhone}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${TAG_BADGE[tag.status]}`}>{tag.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {tag.status !== 'removed' ? (
                      <>
                        {tag.status === 'issued' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => copyCode(tag.code)}>
                            Copy code
                          </button>
                        )}{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => remove(tag)}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="faint" style={{ fontSize: 12 }}>
                        {tag.removalReason ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
