import { onAuthStateChanged, signOut } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getMyCompany, loginCompany, signUpCompany } from './api';
import { auth } from './firebase';
import { Company } from './types';

interface AuthState {
  company: Company | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (companyName: string, adminName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          setCompany(await getMyCompany(u.uid));
        } catch {
          setCompany(null);
        }
      } else {
        setCompany(null);
      }
      setLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    setCompany(await loginCompany(email, password));
  };
  const signup = async (companyName: string, adminName: string, email: string, password: string) => {
    setCompany(await signUpCompany(companyName, adminName, email, password));
  };
  const logout = async () => {
    await signOut(auth);
    setCompany(null);
  };

  return (
    <Ctx.Provider value={{ company, loading, login, signup, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
