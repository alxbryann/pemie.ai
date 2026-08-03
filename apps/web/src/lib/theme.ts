// Tema claro/oscuro. Sin Context/Provider: el estado real vive en el atributo
// data-theme de <html> (ya seteado por el script inline de index.html antes
// del primer paint, para evitar flash) y en localStorage; este hook solo lee
// y escribe ese estado compartido, no lo duplica.

import { useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "pemie-theme";
// Mismos hex que --surface-0 en light/dark (colors.css): no hay forma de leer
// una custom property antes de que el CSS esté aplicado, así que el valor vive
// duplicado acá y en el script inline de index.html a propósito.
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0b1220";

function readInitialTheme(): Theme {
  // Lee lo que el bootstrap de index.html ya resolvió y pintó, en vez de
  // recalcularlo acá: recalcular repetiría el trabajo y podría flashear.
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
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

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return { theme, toggleTheme };
}
