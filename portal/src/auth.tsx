import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getMyCompany, signUpCompany } from './api';
import { isPlatformAdminEmail } from './config';
import { auth } from './firebase';
import { Company } from './types';

interface AuthState {
  company: Company | null;
  isAdmin: boolean;
  adminEmail: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (companyName: string, adminName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch the company doc after a write (rate card, profile) so every
   *  screen — e.g. the dashboard checklist — sees the change immediately. */
  refreshCompany: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u && isPlatformAdminEmail(u.email)) {
        setIsAdmin(true);
        setAdminEmail(u.email);
        setCompany(null);
      } else if (u) {
        setIsAdmin(false);
        try {
          setCompany(await getMyCompany(u.uid));
        } catch {
          setCompany(null);
        }
      } else {
        setIsAdmin(false);
        setCompany(null);
        setAdminEmail(null);
      }
      setLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (isPlatformAdminEmail(cred.user.email)) return; // handled by listener
    const c = await getMyCompany(cred.user.uid);
    if (!c) throw new Error('No company is linked to this account.');
    setCompany(c);
  };
  const signup = async (companyName: string, adminName: string, email: string, password: string) => {
    setCompany(await signUpCompany(companyName, adminName, email, password));
  };
  const logout = async () => {
    await signOut(auth);
    setCompany(null);
    setIsAdmin(false);
  };
  const refreshCompany = async () => {
    const u = auth.currentUser;
    if (u && !isPlatformAdminEmail(u.email)) {
      try {
        setCompany(await getMyCompany(u.uid));
      } catch {
        /* keep the stale copy rather than flashing to null */
      }
    }
  };

  return (
    <Ctx.Provider value={{ company, isAdmin, adminEmail, loading, login, signup, logout, refreshCompany }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
