import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppUser, Customer, Tradie } from '../types';
import { biometricUnlock, isBiolockEnabled } from '../lib/biometrics';
import { getPushToken } from '../lib/push';
import {
  backend,
  CustomerRegistration,
  getSessionUser,
  TradieRegistration,
} from '../services';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  /** True when a restored session must pass biometrics before the app opens.
   *  Set only on cold start (i.e. after the app was fully closed). */
  locked: boolean;
  /** True when a previous session was ended on cold start (app fully closed
   *  without biometric unlock enabled) — routes straight to the login screen. */
  sessionEnded: boolean;
  /** Prompt the OS biometric sheet; unlocks the session on success. */
  unlock: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<AppUser>;
  registerCustomer: (input: CustomerRegistration) => Promise<Customer>;
  registerTradie: (input: TradieRegistration) => Promise<Tradie>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  /** Keep the in-memory user live against backend changes (status, rating). */
  const bind = useCallback((u: AppUser | null) => {
    unsubRef.current?.();
    unsubRef.current = null;
    setUser(u);
    if (u) {
      unsubRef.current = backend.subscribeUser(u.id, (fresh) => {
        if (fresh) setUser(fresh);
      });
      // Register this device for push (guarded no-op on binaries without the
      // native module; never blocks login).
      void getPushToken().then((token) => {
        if (token) return backend.setPushToken(u.id, token);
      });
    }
  }, []);

  // Cold-start policy (banking pattern): fully closing the app ends the
  // session. On reopen, a user with biometric unlock enabled gets the
  // fingerprint lock screen; everyone else is signed out and lands on the
  // login screen.
  useEffect(() => {
    (async () => {
      const u = await getSessionUser();
      if (u) {
        if (await isBiolockEnabled()) {
          setLocked(true);
          bind(u);
        } else {
          await backend.logout().catch(() => {});
          setSessionEnded(true);
          bind(null);
        }
      } else {
        bind(null);
      }
      setLoading(false);
    })();
    return () => unsubRef.current?.();
  }, [bind]);

  const unlock = useCallback(async () => {
    const ok = await biometricUnlock('Unlock QuickieFix');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await backend.login(email, password);
      bind(u);
      return u;
    },
    [bind],
  );

  const registerCustomer = useCallback(
    async (input: CustomerRegistration) => {
      const u = await backend.registerCustomer(input);
      bind(u);
      return u;
    },
    [bind],
  );

  const registerTradie = useCallback(
    async (input: TradieRegistration) => {
      const u = await backend.registerTradie(input);
      bind(u);
      return u;
    },
    [bind],
  );

  const logout = useCallback(async () => {
    // Explicit sign-out: stop pushes reaching this device. (The cold-start
    // session end deliberately KEEPS the token so an available tradie still
    // receives job offers while the app is closed.)
    if (user) await backend.setPushToken(user.id, null).catch(() => {});
    await backend.logout();
    setLocked(false);
    setSessionEnded(true); // returning users land on login, not the pitch page
    bind(null);
  }, [bind, user]);

  const value = useMemo(
    () => ({ user, loading, locked, sessionEnded, unlock, login, registerCustomer, registerTradie, logout }),
    [user, loading, locked, sessionEnded, unlock, login, registerCustomer, registerTradie, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Narrowing helpers for screens that require a specific role. */
export function useCustomer(): Customer {
  const { user } = useAuth();
  if (!user || user.role !== 'customer') throw new Error('Expected a customer session');
  return user;
}

export function useTradie(): Tradie {
  const { user } = useAuth();
  if (!user || user.role !== 'tradie') throw new Error('Expected a tradie session');
  return user;
}
