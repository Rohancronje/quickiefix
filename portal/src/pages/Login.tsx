import { useState } from 'react';
import { useAuth } from '../auth';

export function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [companyName, setCompanyName] = useState('');
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
        await signup(companyName, adminName, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError((err as Error).message.replace('Firebase: ', ''));
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.png" alt="QuickieFix" style={{ height: 104, maxWidth: '100%' }} />
          <div className="brand-sub" style={{ marginTop: 4 }}>Business Portal</div>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
          {mode === 'login' ? 'Welcome back' : 'Create your company'}
        </h2>
        <p className="muted" style={{ marginBottom: 24, fontSize: 15 }}>
          {mode === 'login'
            ? 'Sign in to manage your tradies.'
            : 'Set up your business to manage and invite tradies.'}
        </p>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <div className="field">
                <label>Company name</label>
                <input
                  placeholder="Lazer Plumbing Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Your name</label>
                <input
                  placeholder="Alex Manager"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.co.nz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="err">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create company'}
          </button>
        </form>

        <p className="muted" style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
          {mode === 'login' ? "Don't have a company account? " : 'Already registered? '}
          <a
            style={{ color: 'var(--amber-dark)', fontWeight: 700, cursor: 'pointer' }}
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
