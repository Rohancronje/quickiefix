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
import {
  backend,
  CustomerRegistration,
  getSessionUser,
  TradieRegistration,
} from '../services';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AppUser>;
  registerCustomer: (input: CustomerRegistration) => Promise<Customer>;
  registerTradie: (input: TradieRegistration) => Promise<Tradie>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
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
    }
  }, []);

  // Restore any persisted session on cold start.
  useEffect(() => {
    (async () => {
      const u = await getSessionUser();
      bind(u);
      setLoading(false);
    })();
    return () => unsubRef.current?.();
  }, [bind]);

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
    await backend.logout();
    bind(null);
  }, [bind]);

  const value = useMemo(
    () => ({ user, loading, login, registerCustomer, registerTradie, logout }),
    [user, loading, login, registerCustomer, registerTradie, logout],
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
