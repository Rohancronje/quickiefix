import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Local marker: this device has logged in before → cold starts route straight
 *  to LOGIN (no network wait) instead of the first-run welcome pitch. */
const HAD_SESSION_KEY = 'quickiefix.hadSession.v1';
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
      void AsyncStorage.setItem(HAD_SESSION_KEY, '1').catch(() => {});
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
  // session. Biometric users get the fingerprint lock; everyone else goes
  // straight to login. FAST PATH: when biometrics is off we already know the
  // destination, so route instantly from local flags and do the Firebase
  // sign-out in the background — no network wait on the splash screen.
  useEffect(() => {
    (async () => {
      const [bioEnabled, hadSession] = await Promise.all([
        isBiolockEnabled(),
        AsyncStorage.getItem(HAD_SESSION_KEY).catch(() => null),
      ]);

      if (!bioEnabled) {
        if (hadSession === '1') setSessionEnded(true); // returning user → login
        bind(null);
        setLoading(false);
        // Background housekeeping: clear any persisted Firebase session.
        void getSessionUser()
          .then((u) => (u ? backend.logout() : undefined))
          .catch(() => {});
        return;
      }

      // Biometric path needs the restored session to lock behind the prompt.
      const u = await getSessionUser();
      if (u) {
        setLocked(true);
        bind(u);
      } else {
        if (hadSession === '1') setSessionEnded(true);
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

  // Background policy: some devices keep the process alive after a swipe-away,
  // so the cold-start rule alone isn't enough. If the app has been out of the
  // foreground for over a minute (backgrounded, screen off, or a surviving
  // "closed" process), end the session the same way: biometric users re-lock,
  // everyone else is signed out to the login screen. The grace window means
  // quickly hopping to Maps and back never logs a tradie out.
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const BG_GRACE_MS = 60_000;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      const away = backgroundedAt.current != null ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;
      if (!user || away < BG_GRACE_MS) return;
      void (async () => {
        if (await isBiolockEnabled()) {
          setLocked(true);
        } else {
          // Session-end (not explicit logout): keep the push token so an
          // available tradie keeps receiving job offers.
          await backend.logout().catch(() => {});
          setSessionEnded(true);
          bind(null);
        }
      })();
    });
    return () => sub.remove();
  }, [user, bind]);

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
