import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmClaimedTag, issueTag, listCompanyTags, listCompanyTradies, removeTag } from '../api';
import { useAuth } from '../auth';
import { IconTag, IconTradies } from '../backoffice/icons';
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

const TAG_CHIP: Record<CompanyTagStatus, string> = {
  issued: 'co-chip-amber',
  claimed: 'co-chip-blue',
  validated: 'co-chip-green',
  removed: 'co-chip-grey',
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
    try {
      await removeTag(tag.id);
      await refresh(company);
      flash('Seat removed');
    } catch (e) {
      // Never fail silently — a denied write must be visible.
      flash(`Could not remove: ${(e as Error).message}`);
    }
  };

  // You issued the seat, you know the tradie — confirming the claim is yours.
  const confirmClaim = async (tag: CompanyTag) => {
    if (!company) return;
    const engagement = tag.engagement ?? 'employee';
    const detail =
      engagement === 'contractor'
        ? 'They declared themselves a CONTRACTOR: they keep their own business name and NZBN, and invoice you for their work.'
        : `They declared themselves an EMPLOYEE: they'll appear under their personal name with ${company.name}'s NZBN.`;
    if (
      !confirm(
        `Confirm ${tag.issuedToName} (${tag.issuedToEmail}) as part of ${company.name}?\n\n${detail}\n\nTheir jobs will carry your company name and rate card from now on.`,
      )
    )
      return;
    try {
      await confirmClaimedTag(tag.id);
      await refresh(company);
      flash(`${tag.issuedToName} is now on your roster ✓`);
    } catch (e) {
      flash(`Could not confirm: ${(e as Error).message}`);
    }
  };

  // Roster = validated members. Union users bound to the company with validated
  // tags (deduped by the claiming user id / email).
  const validatedTags = tags.filter((t) => t.status === 'validated');
  const rosterIds = new Set(tradies.map((t) => t.id));
  const extraValidated = validatedTags.filter(
    (t) => !t.claimedByUserId || !rosterIds.has(t.claimedByUserId),
  );
  const rosterCount = tradies.length + extraValidated.length;

  const readyRows = rows?.filter((r) => !r._error).length ?? 0;
  const issueRows = rows?.filter((r) => r._error).length ?? 0;

  return (
    <div className="co-stack">
      {/* Roster (validated members) */}
      <div className="co-card flush">
        <div className="co-card-head plain">
          <span className="co-card-title">
            Tradies in {company?.name} ({rosterCount})
          </span>
        </div>
        {rosterCount === 0 ? (
          <div className="co-empty">
            <span className="co-empty-ico">
              <IconTradies size={28} />
            </span>
            <div className="co-empty-title">No validated tradies yet</div>
            <div className="co-empty-sub">Add a seat below and send the code to your tradie.</div>
          </div>
        ) : (
          <table className="co-table">
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
                <tr key={t.id} className="co-rowlink" onClick={() => nav(`/tradie/${t.id}`)}>
                  <td>
                    <div className="co-idcell">
                      <div className="co-avatar">{initials(t.firstName, t.lastName)}</div>
                      <div className="co-idcell-name">
                        {t.firstName} {t.lastName}
                      </div>
                    </div>
                  </td>
                  <td>{tradeLabel(t.primaryTrade)}</td>
                  <td className="co-sub">{t.email}</td>
                  <td />
                </tr>
              ))}
              {extraValidated.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <div className="co-idcell">
                      <div className="co-avatar">{initials(tag.issuedToName, '')}</div>
                      <div className="co-idcell-name">{tag.issuedToName}</div>
                    </div>
                  </td>
                  <td className="co-sub">—</td>
                  <td className="co-sub">{tag.issuedToEmail}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add seat */}
      <div className="co-card">
        <div className="co-sectionhead">Add a seat</div>
        <p className="co-help">
          Issue a tag for a tradie. They enter the code in the app to claim their seat; a platform
          admin then validates it.
        </p>
        <div className="co-formrow cols-3" style={{ marginBottom: 16 }}>
          <div className="co-field">
            <label>Name</label>
            <input
              className="co-input"
              value={seatName}
              onChange={(e) => setSeatName(e.target.value)}
              placeholder="Mike Jones"
            />
          </div>
          <div className="co-field">
            <label>Email</label>
            <input
              className="co-input"
              value={seatEmail}
              onChange={(e) => setSeatEmail(e.target.value)}
              placeholder="mike@lazer.co.nz"
            />
          </div>
          <div className="co-field">
            <label>Phone (optional)</label>
            <input
              className="co-input"
              value={seatPhone}
              onChange={(e) => setSeatPhone(e.target.value)}
              placeholder="021 234 5678"
            />
          </div>
        </div>
        <button
          className="co-btn co-btn-primary"
          disabled={busy || !seatName.trim() || !seatEmail.trim()}
          onClick={addSeat}
        >
          Add seat
        </button>

        {lastTag && (
          <div className="co-notice" style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>
              Tag issued for {lastTag.issuedToName}
            </p>
            <div className="co-flex" style={{ gap: 12 }}>
              <span className="co-code" style={{ fontSize: 18, letterSpacing: 1 }}>
                {lastTag.code}
              </span>
              <button className="co-btn co-btn-ghost co-btn-sm" onClick={() => copyCode(lastTag.code)}>
                Copy code
              </button>
            </div>
            <p className="co-sub" style={{ fontSize: 13, marginTop: 10 }}>
              Send this code to the tradie. It expires in 14 days.
            </p>
          </div>
        )}
      </div>

      {/* Spreadsheet import */}
      <div className="co-card">
        <div className="co-between" style={{ marginBottom: 8 }}>
          <div className="co-sectionhead" style={{ marginBottom: 0 }}>
            Import from a spreadsheet
          </div>
          <button className="co-btn co-btn-ghost co-btn-sm" onClick={downloadTemplate}>
            Download template
          </button>
        </div>
        <p className="co-help">
          Download the template, fill in your tradies, then upload it. Each tradie gets an account
          linked to {company?.name} (with a pre-validated tag) and an email to set their password.
          Valid trades: <span className="co-sub">{VALID_TRADES.join(', ')}</span>.
        </p>

        {!importing && !results && (
          <label className="co-btn co-btn-ghost co-btn-sm" style={{ display: 'inline-flex' }}>
            Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}

        {/* Preview parsed rows */}
        {rows && !importing && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 10, fontSize: 13.5 }}>
              {readyRows} ready ·{' '}
              <span style={{ color: 'var(--danger)' }}>{issueRows} with issues</span>
            </p>
            <div
              style={{
                maxHeight: 220,
                overflow: 'auto',
                border: '1px solid var(--line-200)',
                borderRadius: 8,
              }}
            >
              <table className="co-table">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="co-sub">{r.email}</td>
                      <td>{tradeLabel(r.primaryTrade)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r._error ? (
                          <span className="co-chip co-chip-red">{r._error}</span>
                        ) : (
                          <span className="co-chip co-chip-green">ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="co-flex" style={{ gap: 10, marginTop: 14 }}>
              <button
                className="co-btn co-btn-primary co-btn-sm"
                disabled={readyRows === 0}
                onClick={runImport}
              >
                Import {readyRows} tradie(s)
              </button>
              <button className="co-btn co-btn-ghost co-btn-sm" onClick={() => setRows(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {importing && (
          <div className="co-flex" style={{ gap: 12, marginTop: 16 }}>
            <div className="spinner" />
            <span className="co-sub">Creating accounts &amp; sending emails… {progress}</span>
          </div>
        )}

        {results && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 10, fontSize: 13.5 }}>
              {results.filter((r) => r.ok).length} imported ·{' '}
              {results.filter((r) => !r.ok).length} skipped
            </p>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} className="co-between" style={{ padding: '6px 0' }}>
                  <span className="co-sub">{r.email}</span>
                  <span className={`co-chip ${r.ok ? 'co-chip-green' : 'co-chip-grey'}`}>
                    {r.message}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="co-btn co-btn-ghost co-btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setResults(null)}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Tag roster */}
      <div className="co-card flush">
        <div className="co-card-head plain">
          <span className="co-card-title">Tags ({tags.length})</span>
        </div>
        {tags.length === 0 ? (
          <div className="co-empty">
            <span className="co-empty-ico">
              <IconTag size={28} />
            </span>
            <div className="co-empty-title">No tags issued yet</div>
            <div className="co-empty-sub">Add a seat above to issue your first tag.</div>
          </div>
        ) : (
          <table className="co-table">
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
                    <span className="co-code">{tag.code}</span>
                  </td>
                  <td>
                    <div className="co-idcell-name">{tag.issuedToName}</div>
                    <div className="co-idcell-sub">
                      {tag.issuedToEmail}
                      {tag.issuedToPhone ? ` · ${tag.issuedToPhone}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`co-chip ${TAG_CHIP[tag.status]}`}>{tag.status}</span>{' '}
                    {tag.engagement && tag.status !== 'issued' && (
                      <span className={`co-chip ${tag.engagement === 'contractor' ? 'co-chip-blue' : 'co-chip-grey'}`}>
                        {tag.engagement}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {tag.status !== 'removed' ? (
                      <>
                        {tag.status === 'issued' && (
                          <button
                            className="co-btn co-btn-ghost co-btn-sm"
                            onClick={() => copyCode(tag.code)}
                          >
                            Copy code
                          </button>
                        )}{' '}
                        {tag.status === 'claimed' && (
                          <button
                            className="co-btn co-btn-primary co-btn-sm"
                            onClick={() => confirmClaim(tag)}
                          >
                            Confirm tradie
                          </button>
                        )}{' '}
                        <button className="co-btn co-btn-danger co-btn-sm" onClick={() => remove(tag)}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="co-sub" style={{ fontSize: 12 }}>
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

      {toast && <div className="co-toast">{toast}</div>}
    </div>
  );
}
