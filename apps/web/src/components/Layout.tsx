// Shell de la app autenticada: header sticky con marca, navegación y menú de usuario.

import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { LogoMark, Notice, Wordmark } from "./ui.js";

const ANALYTICS_NOTICE_DISMISSED_KEY = "pemie_analytics_notice_dismissed";

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-surface-50">
      {/* Único lugar del sistema donde se usa transparencia + blur. */}
      <header className="sticky top-0 z-50 border-b border-line-200 bg-white/[0.82] backdrop-blur-xl">
        <div className="mx-auto flex max-w-container items-center gap-3 px-4 py-3.5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <Wordmark />
          </Link>
          {user && (
            <div className="ml-auto">
              <AccountMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
            </div>
          )}
        </div>
      </header>
      {user && <AnalyticsNotice />}
      <main className="mx-auto w-full max-w-container flex-1 px-4 py-12 sm:px-8">{children}</main>
    </div>
  );
}

/** Aviso no bloqueante, una sola vez por navegador — dismissible, no es un gate. */
function AnalyticsNotice() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(ANALYTICS_NOTICE_DISMISSED_KEY) === "1"
  );
  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(ANALYTICS_NOTICE_DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="mx-auto w-full max-w-container px-4 pt-4 sm:px-8">
      <Notice tone="info" onDismiss={dismiss}>
        Usamos datos de uso para mejorar pemie.ai. Podés desactivarlo cuando quieras en{" "}
        <Link to="/settings" onClick={dismiss} className="font-medium underline">
          Ajustes
        </Link>
        .
      </Notice>
    </div>
  );
}

/** Menú mínimo de cuenta: avatar como trigger, "Ajustes" (toggle de analítica) + "Salir". */
function AccountMenu({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/login");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de cuenta"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-pill transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span className="hidden font-mono text-caption text-ink-500 sm:inline">
          {name ?? email}
        </span>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-pill border border-line-200" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-pill bg-blue-100 text-caption font-semibold text-blue-700">
            {(name ?? email).charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] w-44 overflow-hidden rounded-md border border-line-200 bg-surface-0 py-1.5 shadow-md"
        >
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-body-sm text-ink-800 transition-colors hover:bg-surface-50"
          >
            Ajustes
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={handleLogout}
            className="block w-full px-3.5 py-2 text-left text-body-sm text-ink-800 transition-colors hover:bg-surface-50"
          >
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
