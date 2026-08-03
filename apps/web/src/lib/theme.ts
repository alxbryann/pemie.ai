// Preferencia de tema (light/dark/system). Sin Context/Provider: el estado real
// vive en el atributo data-theme de <html> (ya seteado por el script inline de
// index.html antes del primer paint, para evitar flash) y en localStorage; este
// hook solo lee y escribe ese estado compartido, no lo duplica.

import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const THEME_KEY = "pemie-theme";
// Mismos hex que --surface-0 en light/dark (colors.css): no hay forma de leer
// una custom property antes de que el CSS esté aplicado, así que el valor vive
// duplicado acá y en el script inline de index.html a propósito.
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0b1220";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? DARK_BG : LIGHT_BG);
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  // Lee lo que el bootstrap de index.html ya resolvió y pintó, en vez de
  // recalcularlo acá: recalcular repetiría el trabajo y podría flashear.
  const [resolved, setResolved] = useState<ResolvedTheme>(
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light")
  );

  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      const next = mql.matches ? "dark" : "light";
      setResolved(next);
      applyResolvedTheme(next);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  function setPreference(next: ThemePreference) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage puede tirar en modos de privacidad estrictos: el cambio
      // igual aplica en esta sesión, solo no persiste entre recargas.
    }
    const nextResolved: ResolvedTheme = next === "system" ? (systemPrefersDark() ? "dark" : "light") : next;
    setPreferenceState(next);
    setResolved(nextResolved);
    applyResolvedTheme(nextResolved);
  }

  return { preference, resolved, setPreference };
}
