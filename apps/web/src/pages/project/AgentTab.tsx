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
import { Badge, Button, Card, ErrorText, Input, Spinner } from "../../components/ui.js";

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
        <h3 className="font-semibold">Conectar un agente por MCP</h3>
        <p className="mt-1 text-sm text-slate-500">
          Tu agente (Hermes, u otro) se conecta a este endpoint con una API key. La key define qué
          puede hacer (scopes) y está atada a este proyecto.
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="text-slate-400">Endpoint:</span>{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">{MCP_URL}</code>
          </p>
          <p>
            <span className="text-slate-400">Auth:</span>{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">
              Authorization: Bearer &lt;API-KEY&gt;
            </code>
          </p>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {snippet}
        </pre>
      </Card>

      {/* Nueva API key */}
      <Card>
        <h3 className="font-semibold">Generar API key</h3>
        <form onSubmit={createKey} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nombre (ej: hermes-prod)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="max-w-xs"
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">— sin agente —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Scopes</p>
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => (
                <label
                  key={s}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                    scopes.includes(s)
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={creating || keyName.trim().length < 2 || scopes.length === 0}>
            {creating ? "Generando…" : "Generar API key"}
          </Button>
        </form>

        {newKey && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">
              Copia esta key ahora — no se vuelve a mostrar:
            </p>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-sm">{newKey}</code>
            <button
              className="mt-2 text-xs text-brand hover:underline"
              onClick={() => navigator.clipboard?.writeText(newKey)}
            >
              Copiar al portapapeles
            </button>
          </div>
        )}
      </Card>

      {/* Keys existentes */}
      <Card>
        <h3 className="font-semibold">API keys ({keys.length})</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {keys.length === 0 && <p className="py-2 text-sm text-slate-400">Sin keys todavía.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {k.name} <code className="text-xs text-slate-400">{k.prefix}…</code>
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {k.lastUsedAt
                    ? `último uso ${new Date(k.lastUsedAt).toLocaleString()}`
                    : "sin usar aún"}
                </p>
              </div>
              <Button variant="danger" onClick={() => revoke(k.id)} className="!px-2 !py-1 text-xs">
                Revocar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Agentes */}
      <Card>
        <h3 className="font-semibold">Agentes</h3>
        <form onSubmit={createAgent} className="mt-3 flex gap-2">
          <Input
            placeholder="Nombre del agente (ej: hermes)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" variant="ghost">
            Añadir agente
          </Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          {agents.map((a) => (
            <Badge key={a.id}>
              {a.name} · {a._count.apiKeys} keys
            </Badge>
          ))}
        </div>
      </Card>

      {/* Actividad del agente */}
      <Card>
        <h3 className="font-semibold">Actividad reciente</h3>
        <div className="mt-3 space-y-1">
          {logs.length === 0 && (
            <p className="text-sm text-slate-400">Sin actividad de agente todavía.</p>
          )}
          {logs.slice(0, 20).map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span>
                <Badge>{l.actorType}</Badge>{" "}
                <code className="text-xs">{l.action}</code>
              </span>
              <span className="text-xs text-slate-400">
                {new Date(l.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
