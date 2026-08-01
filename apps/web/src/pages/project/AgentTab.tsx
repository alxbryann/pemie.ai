import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, analyticsFailureReason, ApiError, API_BASE, type Agent, type AuditLog } from "../../lib/api.js";
import { track } from "../../lib/analytics/index.js";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  ErrorText,
  Input,
  Skeleton,
  SkeletonCard,
  SkeletonList,
} from "../../components/ui.js";

const MCP_URL = `${API_BASE}/mcp`;

export default function AgentTab({ ws, proj }: { ws: string; proj: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      const [a, l] = await Promise.all([
        api.agents.list(ws, proj),
        api.audit.listForProject(ws, proj),
      ]);
      setAgents(a.agents);
      setLogs(l.auditLogs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar Agentes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (agentName.trim().length < 2) return;
    setCreating(true);
    setError(null);
    try {
      await api.agents.create(ws, proj, agentName.trim());
      track("agent_registered");
      setAgentName("");
      await load();
    } catch (e) {
      track("agent_registered_failed", { reason: analyticsFailureReason(e) });
      setError(e instanceof ApiError ? e.message : "No se pudo crear el agente");
    } finally {
      setCreating(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <Card>
          <Skeleton className="mb-4 h-5 w-32" />
          <SkeletonList rows={3} />
        </Card>
        <Card>
          <Skeleton className="mb-4 h-5 w-48" />
          <SkeletonList rows={4} />
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      <Card>
        <h3 className="text-h4 text-ink-900">Conectar por MCP</h3>
        <p className="mt-2 text-body-sm text-ink-600">
          Tu agente se conecta a este endpoint con una API key autenticada por cabecera{" "}
          <code className="font-mono text-caption">Authorization: Bearer</code>.
        </p>
        <div className="mt-4">
          <CodeBlock title="MCP ENDPOINT">{MCP_URL}</CodeBlock>
        </div>
        <p className="mt-3 text-body-sm text-ink-500">
          Genera una API key y el prompt sugerido para tu agente en el{" "}
          <Link to={`/w/${ws}/agents`} className="text-blue-700 hover:underline">
            hub de Agentes
          </Link>
          .
        </p>
      </Card>

      <Card>
        <h3 className="text-h4 text-ink-900">Agentes</h3>
        <form onSubmit={createAgent} className="mt-4 flex flex-wrap gap-2">
          <Input
            placeholder="Nombre del agente (ej: hermes)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="max-w-xs"
            aria-label="Nombre del agente"
          />
          <Button type="submit" variant="secondary" disabled={creating || agentName.trim().length < 2}>
            {creating ? "Añadiendo…" : "Añadir agente"}
          </Button>
        </form>
        <div className="mt-4">
          {agents.length === 0 ? (
            <p className="text-body-sm text-ink-400">Sin agentes registrados.</p>
          ) : (
            <div className="divide-y divide-line-100">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 -mx-6 px-6 py-2.5 hover:bg-surface-50"
                >
                  <span className="text-body font-medium text-ink-900">{a.name}</span>
                  <span className="font-mono text-caption text-ink-400">
                    {a._count.apiKeys} keys
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-h4 text-ink-900">Actividad de agentes en este proyecto</h3>
        <p className="mt-2 text-body-sm text-ink-600">
          Audit de las acciones que hicieron tus agentes MCP en este proyecto.
        </p>
        <div className="mt-4">
          {logs.length === 0 ? (
            <EmptyState
              title="Sin actividad"
              description="Las acciones que hagan tus agentes MCP en este proyecto aparecerán aquí."
            />
          ) : (
            <>
              <div className="divide-y divide-line-100">
                {logs.slice(0, 50).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between -mx-6 px-6 py-2.5 hover:bg-surface-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={l.actorType === "agent" ? "brand" : "neutral"} dot>
                        {l.actorType}
                      </Badge>
                      <span className="truncate text-body-sm text-ink-700">{l.actorName}</span>
                      <code className="truncate font-mono text-caption text-ink-700">
                        {l.action}
                      </code>
                    </span>
                    <span className="shrink-0 font-mono text-caption text-ink-400">
                      {new Date(l.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              {logs.length > 50 && (
                <p className="mt-3 text-caption text-ink-400">
                  Mostrando los 50 más recientes de {logs.length}.
                </p>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
