import { useState } from 'react';
import { useAuth } from '../auth';

export function Login() {
  const { login, signup, signupAgency } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [kind, setKind] = useState<'company' | 'agency'>('company');
  const [companyName, setCompanyName] = useState('');
  const [nzbn, setNzbn] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setBusy(true);
      if (mode === 'signup') {
        if (!companyName.trim() || !adminName.trim()) throw new Error('Fill in all fields.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (kind === 'company' && !nzbn.trim()) throw new Error('An NZBN is required for a trade company.');
        if (kind === 'agency') await signupAgency(companyName, adminName, email, password);
        else await signup(companyName, adminName, email, password, nzbn);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError((err as Error).message.replace('Firebase: ', ''));
      setBusy(false);
    }
  };

  return (
    <div className="co-auth">
      <div className="co-auth-card">
        <div className="co-auth-brand">
          <img src="/logo-lockup.svg" alt="QuickieFix" style={{ height: 34, width: 'auto' }} />
        </div>
        <div className="co-auth-sub">Business Portal</div>

        <h2 className="co-auth-title">
          {mode === 'login'
            ? 'Welcome back'
            : kind === 'agency'
              ? 'Create your agency'
              : 'Create your company'}
        </h2>
        <p className="co-auth-lead">
          {mode === 'login'
            ? 'Sign in to manage your business.'
            : kind === 'agency'
              ? 'Manage your properties, tenants and approved tradie panel.'
              : 'Set up your business to manage and invite tradies.'}
        </p>

        <form onSubmit={submit} className="co-stack">
          {mode === 'signup' && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`co-btn co-btn-sm ${kind === 'company' ? 'co-btn-primary' : 'co-btn-ghost'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setKind('company')}
                >
                  🧰 Trade company
                </button>
                <button
                  type="button"
                  className={`co-btn co-btn-sm ${kind === 'agency' ? 'co-btn-primary' : 'co-btn-ghost'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setKind('agency')}
                >
                  🏢 Property agency
                </button>
              </div>
              <div className="co-field">
                <label>{kind === 'agency' ? 'Agency name' : 'Company name'}</label>
                <input
                  className="co-input"
                  placeholder={kind === 'agency' ? 'Harbour Property Management' : 'Your Business Ltd'}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              {kind === 'company' && (
                <div className="co-field">
                  <label>NZBN (required)</label>
                  <input
                    className="co-input"
                    placeholder="9429…"
                    value={nzbn}
                    onChange={(e) => setNzbn(e.target.value)}
                  />
                </div>
              )}
              <div className="co-field">
                <label>Your name</label>
                <input
                  className="co-input"
                  placeholder="Alex Manager"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="co-field">
            <label>Email</label>
            <input
              className="co-input"
              type="email"
              placeholder="you@company.co.nz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="co-field">
            <label>Password</label>
            <input
              className="co-input"
              type="password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="co-err">{error}</div>}

          <button
            className="co-btn co-btn-primary"
            style={{ width: '100%', height: 40, justifyContent: 'center' }}
            disabled={busy}
            type="submit"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : kind === 'agency' ? 'Create agency' : 'Create company'}
          </button>
        </form>

        <p className="co-auth-switch">
          {mode === 'login' ? "Don't have a company account? " : 'Already registered? '}
          <a
            className="co-auth-link"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  );
}
