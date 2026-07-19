// Contexto de autenticación: carga el usuario actual (cookie de sesión) y
// expone login/register/logout al resto de la app.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "./api.js";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { user } = await api.auth.me();
    setUser(user);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    refresh,
    login: async (email, password) => {
      const { user } = await api.auth.login({ email, password });
      setUser(user);
    },
    register: async (email, password, name) => {
      const { user } = await api.auth.register({ email, password, name });
      setUser(user);
    },
    logout: async () => {
      await api.auth.logout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
