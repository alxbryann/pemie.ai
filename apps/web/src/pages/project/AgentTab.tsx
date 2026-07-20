import { useEffect, useMemo, useState } from "react";
import { API_SCOPES } from "@pemie/shared";
import {
  api,
  ApiError,
  API_BASE,
  type Agent,
  type ApiKeyPublic,
  type AuditLog,
} from "../../lib/api.js";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  ErrorText,
  Input,
  Select,
  Spinner,
} from "../../components/ui.js";

const MCP_URL = `${API_BASE}/mcp`;

export default function AgentTab({
  ws,
  proj,
  projectId,
}: {
  ws: string;
  proj: string;
  projectId: string;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario de nueva key
  const [keyName, setKeyName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [scopes, setScopes] = useState<string[]>([...API_SCOPES]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [agentName, setAgentName] = useState("");

  async function load() {
    setError(null);
    try {
      const [a, k, au] = await Promise.all([
        api.agents.list(ws, proj),
        api.apiKeys.list(ws),
        api.audit.list(ws),
      ]);
      setAgents(a.agents);
      setKeys(k.apiKeys.filter((key) => key.projectId === projectId));
      setLogs(au.auditLogs.filter((l) => l.entityId === projectId || l.actorType === "agent"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando la sección de agente");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (agentName.trim().length < 2) return;
    try {
      await api.agents.create(ws, proj, agentName.trim());
      setAgentName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el agente");
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (keyName.trim().length < 2 || scopes.length === 0) return;
    setCreating(true);
    setError(null);
    setNewKey(null);
    try {
      const r = await api.apiKeys.create(ws, {
        name: keyName.trim(),
        projectId,
        agentId: agentId || undefined,
        scopes,
      });
      setNewKey(r.key);
      setKeyName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la API key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await api.apiKeys.revoke(ws, id).then(load).catch(() => {});
  }

  const snippet = useMemo(() => {
    const key = newKey ?? "<TU_API_KEY>";
    return `curl -X POST ${MCP_URL} \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
  }, [newKey]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {/* Cómo conectar */}
      <Card>
        <h3 className="text-h4 text-ink-900">Conectar un agente por MCP</h3>
        <p className="mt-2 text-body-sm text-ink-600">
          Tu agente (Hermes, u otro) se conecta a este endpoint con una API key. La key define qué
          puede hacer (scopes) y está atada a este proyecto.
        </p>
        <div className="mt-4 space-y-3">
          <CodeBlock title="MCP ENDPOINT">{MCP_URL}</CodeBlock>
          <CodeBlock command={snippet} title="bash" />
        </div>
      </Card>

      {/* Nueva API key */}
      <Card>
        <h3 className="text-h4 text-ink-900">Generar API key</h3>
        <form onSubmit={createKey} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nombre (ej: hermes-prod)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="max-w-xs"
            />
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">— sin agente —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="mb-2 text-caption font-mono uppercase text-ink-500">Scopes</p>
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => (
                <label
                  key={s}
                  className={`cursor-pointer rounded-pill border px-2.5 py-1 font-mono text-mono-label font-medium uppercase transition-colors ${
                    scopes.includes(s)
                      ? "border-blue-600 bg-blue-100 text-blue-700"
                      : "border-line-200 bg-surface-100 text-ink-600 hover:border-ink-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <Button
            type="submit"
            disabled={creating || keyName.trim().length < 2 || scopes.length === 0}
          >
            {creating ? "Generando…" : "Generar API key"}
          </Button>
        </form>

        {newKey && (
          <div className="mt-4">
            <p className="mb-2 text-body-sm font-medium text-amber-600">
              Copia esta key ahora — no se vuelve a mostrar.
            </p>
            <CodeBlock title="API KEY">{newKey}</CodeBlock>
          </div>
        )}
      </Card>

      {/* Keys existentes */}
      <Card>
        <h3 className="text-h4 text-ink-900">API keys ({keys.length})</h3>
        <div className="mt-4">
          {keys.length === 0 ? (
            <EmptyState
              title="Sin keys todavía"
              description="Genera una API key para que tu agente pueda autenticarse."
            />
          ) : (
            <div className="divide-y divide-line-100">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-start justify-between gap-3 py-3 hover:bg-surface-50"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink-900">
                      {k.name}{" "}
                      <code className="font-mono text-caption text-ink-400">{k.prefix}…</code>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {k.scopes.map((s) => (
                        <Badge key={s} tone="neutral" mono>
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 font-mono text-caption text-ink-400">
                      {k.lastUsedAt
                        ? `último uso ${new Date(k.lastUsedAt).toLocaleString()}`
                        : "sin usar aún"}
                    </p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => revoke(k.id)}>
                    Revocar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Agentes */}
      <Card>
        <h3 className="text-h4 text-ink-900">Agentes</h3>
        <form onSubmit={createAgent} className="mt-4 flex gap-2">
          <Input
            placeholder="Nombre del agente (ej: hermes)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            Añadir agente
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {agents.length === 0 && (
            <p className="text-body-sm text-ink-400">Sin agentes registrados.</p>
          )}
          {agents.map((a) => (
            <Badge key={a.id} tone="brand">
              {a.name} · {a._count.apiKeys} keys
            </Badge>
          ))}
        </div>
      </Card>

      {/* Actividad del agente */}
      <Card>
        <h3 className="text-h4 text-ink-900">Actividad reciente</h3>
        <div className="mt-4">
          {logs.length === 0 ? (
            <EmptyState
              title="Sin actividad"
              description="Las acciones del agente aparecerán aquí."
            />
          ) : (
            <div className="divide-y divide-line-100">
              {logs.slice(0, 20).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between py-2.5 hover:bg-surface-50"
                >
                  <span className="flex items-center gap-2">
                    <Badge tone={l.actorType === "agent" ? "brand" : "neutral"} dot>
                      {l.actorType}
                    </Badge>
                    <code className="font-mono text-caption text-ink-700">{l.action}</code>
                  </span>
                  <span className="font-mono text-caption text-ink-400">
                    {new Date(l.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
