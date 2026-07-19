import { useEffect, useState } from "react";
import { api, type Health } from "./lib/api.js";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand text-brand-fg grid place-items-center font-bold">
            p
          </div>
          <span className="font-semibold text-lg">pemie.ai</span>
          <span className="ml-auto text-sm text-slate-500">
            plataforma multi-proyecto · personas + agentes
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl w-full px-6 py-12 flex-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Monitorea tus proyectos y equipos
        </h1>
        <p className="mt-3 text-slate-600 max-w-2xl">
          Workspaces, informes de agentes, generación de HUs y kanban — para
          personas por la web y para agentes por MCP.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Estado del backend
          </h2>
          {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
          {!error && !health && (
            <p className="mt-2 text-slate-400 text-sm">conectando…</p>
          )}
          {health && (
            <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-slate-400">servicio</dt>
                <dd className="font-medium">{health.service}</dd>
              </div>
              <div>
                <dt className="text-slate-400">estado</dt>
                <dd className="font-medium text-green-600">{health.status}</dd>
              </div>
              <div>
                <dt className="text-slate-400">db</dt>
                <dd
                  className={
                    health.db === "ok"
                      ? "font-medium text-green-600"
                      : "font-medium text-amber-600"
                  }
                >
                  {health.db}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </main>
    </div>
  );
}
