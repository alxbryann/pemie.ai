// Shell de la app autenticada: header sticky con marca, navegación y menú de usuario.

import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { Button, LogoMark, Wordmark } from "./ui.js";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-50">
      {/* Único lugar del sistema donde se usa transparencia + blur. */}
      <header className="sticky top-0 z-50 border-b border-line-200 bg-white/[0.82] backdrop-blur-xl">
        <div className="mx-auto flex max-w-container items-center gap-3 px-8 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <Wordmark />
          </Link>
          {user && (
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden font-mono text-caption text-ink-500 sm:inline">
                {user.name ?? user.email}
              </span>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-pill border border-line-200"
                />
              ) : (
                <div className="grid h-7 w-7 place-items-center rounded-pill bg-blue-100 text-caption font-semibold text-blue-700">
                  {(user.name ?? user.email).charAt(0).toUpperCase()}
                </div>
              )}
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Salir
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-container flex-1 px-8 py-12">{children}</main>
    </div>
  );
}
