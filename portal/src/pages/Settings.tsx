import { useState } from 'react';
import { updateCompanyName } from '../api';
import { useAuth } from '../auth';

export function Settings() {
  const { company, logout } = useAuth();
  const [name, setName] = useState(company?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const save = async () => {
    if (!company || !name.trim()) return;
    setSaving(true);
    await updateCompanyName(company.id, name);
    setSaving(false);
    flash('Saved — refresh to see it everywhere');
  };

  return (
    <div className="grid" style={{ gap: 24, maxWidth: 620 }}>
      <div className="card">
        <div className="section-title">Company profile</div>
        <div className="field">
          <label>Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={save}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="card">
        <div className="section-title">Account</div>
        <table>
          <tbody>
            <tr>
              <td className="faint">Admin email</td>
              <td style={{ fontWeight: 600 }}>{company?.adminEmail}</td>
            </tr>
            <tr>
              <td className="faint">Company ID</td>
              <td>
                <span className="pill-code">{company?.id}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="section-title">Session</div>
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
