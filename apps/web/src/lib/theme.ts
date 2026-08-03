// Tema claro/oscuro, con alcance al shell autenticado (lo monta Layout). El
// estado real vive en el atributo data-theme de <html> y en localStorage; este
// hook solo lee y escribe ese estado compartido, no lo duplica.

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "pemie-theme";
// Mismos hex que --surface-0 en light/dark (colors.css): no hay forma de leer
// una custom property antes de que el CSS esté aplicado, así que el valor vive
// duplicado acá y en el script inline de index.html a propósito.
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0b1220";

function resolvePreferredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // seguir al default de abajo
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? DARK_BG : LIGHT_BG);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage puede tirar en modos de privacidad estrictos: el cambio
    // igual aplica en esta sesión, solo no persiste entre recargas.
  }
}

/**
 * Landing/login/registro/invitación fijan data-theme="light" en el bootstrap
 * de index.html (tienen diseño propio, no siguen la preferencia del usuario).
 * Si se navega ahí sin recarga completa (ej. login exitoso hacia /app), ese
 * bootstrap no vuelve a correr — por eso al montar recalculamos desde
 * localStorage/SO en vez de confiar en el atributo que ya esté puesto, y al
 * desmontar (volver a una ruta pública sin recarga) lo soltamos para no
 * dejar el tema del usuario filtrado ahí.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(resolvePreferredTheme);

  useEffect(() => {
    applyTheme(theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", LIGHT_BG);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return { theme, toggleTheme };
}
