import { useEffect, useState } from "react";
import { api, ApiError, type AuditLog } from "../../lib/api.js";
import { Badge, Card, EmptyState, ErrorText, Skeleton, SkeletonList } from "../../components/ui.js";

/** Actividad de alcance proyecto; la conexión y los agentes viven ahora en Equipo. */
export default function AgentTab({ ws, proj }: { ws: string; proj: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.audit.listForProject(ws, proj)
      .then((result) => setLogs(result.auditLogs))
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la actividad"))
      .finally(() => setLoading(false));
  }, [ws, proj]);

  if (loading) {
    return <Card><Skeleton className="mb-4 h-5 w-48" /><SkeletonList rows={4} /></Card>;
  }

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>
      <Card>
        <h3 className="text-h4 text-ink-900">Actividad del proyecto</h3>
        <p className="mt-2 text-body-sm text-ink-600">Audit de las acciones hechas por personas, agentes y API keys en este proyecto.</p>
        <div className="mt-4">
          {logs.length === 0 ? <EmptyState title="Sin actividad" description="Las acciones del proyecto aparecerán aquí." /> : (
            <>
              <div className="divide-y divide-line-100">
                {logs.slice(0, 50).map((log) => (
                  <div key={log.id} className="flex items-center justify-between -mx-6 px-6 py-2.5 hover:bg-surface-50">
                    <span className="flex min-w-0 items-center gap-2"><Badge tone={log.actorType === "agent" ? "brand" : "neutral"} dot>{log.actorType}</Badge><span className="truncate text-body-sm text-ink-700">{log.actorName}</span><code className="truncate font-mono text-caption text-ink-700">{log.action}</code></span>
                    <span className="shrink-0 font-mono text-caption text-ink-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {logs.length > 50 ? <p className="mt-3 text-caption text-ink-400">Mostrando los 50 más recientes de {logs.length}.</p> : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
