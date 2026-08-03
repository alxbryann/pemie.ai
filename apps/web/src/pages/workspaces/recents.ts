// Historial local de workspaces visitados: no hay señal de actividad real en la API,
// así que "recientes" se arma con lo último que el propio usuario abrió en este navegador.

const STORAGE_KEY = "pemie_recent_workspaces";
const MAX_RECENTS = 5;

export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Registra `slug` como el más reciente. Se llama al entrar a un workspace por cualquier vía. */
export function touchWorkspace(slug: string): void {
  try {
    const next = [slug, ...readRecents().filter((s) => s !== slug)].slice(0, MAX_RECENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage puede fallar (modo privado, cuota): nunca debe tumbar la navegación.
  }
}
