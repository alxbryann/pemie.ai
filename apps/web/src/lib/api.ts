// Cliente HTTP del backend pemie-api. El frontend es puro cliente: toda la
// lógica de negocio vive en el backend. Aquí solo hay transporte.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface Health {
  status: string;
  service: string;
  db: string;
  timestamp: string;
}

export const api = {
  health: () => apiGet<Health>("/api/health"),
};
