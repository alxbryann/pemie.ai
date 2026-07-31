import { useEffect, useMemo, useState } from "react";
import {
  API_SCOPES,
  API_KEY_SCOPE_LEVELS,
  CHANNEL_LLM_PROVIDERS,
  CHANNEL_LLM_DEFAULT_MODELS,
  CHANNEL_LLM_MODELS,
  type ApiKeyScopeLevel,
  type ChannelLlmProvider,
} from "@pemie/shared";
import {
  api,
  ApiError,
  API_BASE,
  type Agent,
  type ApiKeyPublic,
  type AuditLog,
  type TelegramChannelStatus,
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
  SkeletonCard,
} from "../../components/ui.js";

const MCP_URL = `${API_BASE}/mcp`;

const SCOPE_LABELS: Record<ApiKeyScopeLevel, string> = {
  project: "Proyecto",
  workspace: "Workspace",
  user: "Usuario",
};

const LLM_PROVIDER_LABELS: Record<ChannelLlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

const LLM_KEY_PLACEHOLDER: Record<ChannelLlmProvider, string> = {
  anthropic: "sk-ant-… (Anthropic)",
  openai: "sk-… (OpenAI)",
  deepseek: "sk-… (DeepSeek)",
};

function TelegramChannelCard({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<TelegramChannelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [startPayload, setStartPayload] = useState<string | null>(null);
  const [llmKey, setLlmKey] = useState("");
  const [llmProvider, setLlmProvider] = useState<ChannelLlmProvider>("anthropic");
  const [llmModel, setLlmModel] = useState(CHANNEL_LLM_DEFAULT_MODELS.anthropic);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const r = await api.channels.telegramStatus();
      setStatus(r.channel);
      if (r.channel.llmProvider) setLlmProvider(r.channel.llmProvider);
      if (r.channel.model) setLlmModel(r.channel.model);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando Telegram");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.createLinkToken(projectId);
      setDeepLink(r.deepLink);
      setStartPayload(r.startPayload);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el enlace");
    } finally {
      setBusy(false);
    }
  }

  async function saveLlmKey(e: React.FormEvent) {
    e.preventDefault();
    if (llmKey.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.setLlmKey(llmKey.trim(), {
        provider: llmProvider,
        model: llmModel || CHANNEL_LLM_DEFAULT_MODELS[llmProvider],
      });
      setStatus(r.channel);
      setLlmKey("");
      await api.channels.setDefaultProject(projectId);
      const refreshed = await api.channels.telegramStatus();
      setStatus(refreshed.channel);
      if (refreshed.channel.model) setLlmModel(refreshed.channel.model);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la key");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLlmKey(provider: ChannelLlmProvider) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.deleteLlmKey(provider);
      setStatus(r.channel);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar la key");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.channels.disconnect();
      setDeepLink(null);
      setStartPayload(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo desvincular");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonCard lines={3} />;

  const savedProviders = status?.providers
    ? CHANNEL_LLM_PROVIDERS.filter((p) => status.providers[p]?.hasKey)
    : [];

  const stateLabel = !status?.botConfigured
    ? "Bot no configurado en el servidor"
    : !status.linked
      ? "No vinculado"
      : !status.hasLlmKey
        ? "Falta API key LLM"
        : status.ready
          ? "Listo"
          : "Incompleto";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-h4 text-ink-900">Canal Telegram</h3>
          <p className="mt-2 text-body-sm text-ink-600">
            Habla con Pemie desde Telegram (BYOK: Anthropic, OpenAI o DeepSeek). Al vincular se
            crea una API key de usuario MCP para tus proyectos.
          </p>
        </div>
        <Badge tone={status?.ready ? "brand" : "neutral"}>{stateLabel}</Badge>
      </div>

      <ErrorText>{error}</ErrorText>

      {!status?.botConfigured ? (
        <p className="mt-4 text-body-sm text-ink-500">
          Configura <code className="font-mono text-caption">TELEGRAM_BOT_TOKEN</code>,{" "}
          <code className="font-mono text-caption">TELEGRAM_BOT_USERNAME</code>,{" "}
          <code className="font-mono text-caption">TELEGRAM_WEBHOOK_SECRET</code> y{" "}
          <code className="font-mono text-caption">CHANNEL_SECRETS_KEY</code> en el servidor.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {status.linked && (
            <p className="text-body-sm text-ink-600">
              Vinculado como{" "}
              <span className="font-medium">@{status.telegramUsername ?? "usuario"}</span>
              {status.hasLlmKey && (
                <>
                  {" "}
                  · {LLM_PROVIDER_LABELS[status.llmProvider]}{" "}
                  <code className="font-mono text-caption">…{status.llmKeyLast4}</code>
                </>
              )}
              {status.apiKeyPrefix && (
                <>
                  {" "}
                  · MCP key <code className="font-mono text-caption">{status.apiKeyPrefix}…</code>
                </>
              )}
              {status.defaultProject && (
                <>
                  {" "}
                  · proyecto <code className="font-mono text-caption">{status.defaultProject.slug}</code>
                </>
              )}
            </p>
          )}

          {!status.linked && (
            <div className="space-y-2">
              <Button type="button" onClick={createLink} disabled={busy}>
                {busy ? "Generando…" : "Generar enlace de vínculo"}
              </Button>
              {deepLink && (
                <p className="text-body-sm">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Abrir en Telegram
                  </a>
                </p>
              )}
              {!deepLink && startPayload && (
                <CodeBlock title="En el bot, envía">{`/start ${startPayload}`}</CodeBlock>
              )}
              {deepLink && startPayload && (
                <p className="font-mono text-caption text-ink-400">o /start {startPayload}</p>
              )}
            </div>
          )}

          {status.linked && status.providers && (
            <div className="space-y-2">
              <p className="text-caption text-ink-500">
                Keys guardadas. En Telegram: /proveedor, /modelo, /reset.
              </p>
              {savedProviders.length === 0 ? (
                <p className="text-caption text-ink-400">
                  Ninguna todavía: pega una key abajo para activar el bot.
                </p>
              ) : (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {savedProviders.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <span className="text-caption text-ink-600">
                        {LLM_PROVIDER_LABELS[p]}{" "}
                        <code className="font-mono">…{status.providers[p].last4}</code>
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteLlmKey(p)}
                        disabled={busy}
                        aria-label={`Borrar la API key de ${LLM_PROVIDER_LABELS[p]}`}
                      >
                        Borrar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {status.linked && (
            <form onSubmit={saveLlmKey} className="flex flex-wrap gap-2">
              <Select
                value={llmProvider}
                onChange={(e) => {
                  const p = e.target.value as ChannelLlmProvider;
                  setLlmProvider(p);
                  setLlmModel(CHANNEL_LLM_DEFAULT_MODELS[p]);
                }}
                aria-label="Proveedor LLM"
              >
                {CHANNEL_LLM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {LLM_PROVIDER_LABELS[p]}
                    {status.providers?.[p]?.hasKey ? " ✓" : ""}
                  </option>
                ))}
              </Select>
              <Select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                aria-label="Modelo LLM"
              >
                {(CHANNEL_LLM_MODELS[llmProvider] ?? [CHANNEL_LLM_DEFAULT_MODELS[llmProvider]]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              </Select>
              <Input
                type="password"
                placeholder={
                  status.providers?.[llmProvider]?.hasKey
                    ? `Key actual …${status.providers[llmProvider].last4}`
                    : LLM_KEY_PLACEHOLDER[llmProvider]
                }
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                className="max-w-md min-w-0 flex-1"
                aria-label="API key LLM"
              />
              <Button type="submit" disabled={busy || llmKey.trim().length < 20} variant="secondary">
                Guardar key
              </Button>
            </form>
          )}

          {status.linked && (
            <Button type="button" variant="danger" size="sm" onClick={disconnect} disabled={busy}>
              Desvincular
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

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

  const [keyName, setKeyName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [scopeLevel, setScopeLevel] = useState<ApiKeyScopeLevel>("project");
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
      // Mostrar keys de este proyecto + keys amplias del home workspace.
      setKeys(
        k.apiKeys.filter((key) => {
          const level = key.scopeLevel ?? "project";
          if (level === "project") return key.projectId === projectId;
          return true;
        })
      );
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
        scopeLevel,
        projectId: scopeLevel === "project" ? projectId : undefined,
        agentId: scopeLevel === "project" && agentId ? agentId : undefined,
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

  const systemPrompt = useMemo(() => {
    const key = newKey ?? "<TU_API_KEY>";
    const broadHint =
      scopeLevel !== "project"
        ? `
## Alcance de tu API key (${scopeLevel})
Tu key no está fijada a un solo proyecto. Antes de operar:
1. Llama a list_workspaces y/o list_projects para descubrir IDs.
2. Pasa projectId en CADA tool de proyecto (get_project_context, list_board, etc.).
Proyecto de referencia al generar esta key: "${proj}" (id ${projectId}).
`
        : `
## Alcance
Tu key está fijada al proyecto "${proj}" (id ${projectId}). Puedes omitir projectId en las tools.
`;
    return `Eres un agente conectado a pemie.ai (workspace "${ws}").
Tu trabajo es monitorear y documentar el avance del equipo: leer commits, mantener
el objetivo, publicar informes, responder notas, y gestionar Historias de Usuario y el
tablero Kanban.
${broadHint}
## Conexión (MCP · JSON-RPC 2.0 sobre HTTP)
- Endpoint: ${MCP_URL}
- Autenticación: cabecera "Authorization: Bearer ${key}"
- Protocolo: envía POST con {"jsonrpc":"2.0","id":<n>,"method":<método>,"params":<obj>}
- Descubre las herramientas con method "tools/list"; invócalas con method "tools/call"
  y params {"name":"<tool>","arguments":{...}}.
- Todo lo que haces queda auditado y está limitado por los scopes de tu API key.

## Herramientas disponibles
Descubrimiento:
- list_workspaces — workspaces accesibles con tu key.
- list_projects — proyectos accesibles (opcional: filtrar por workspaceId).

Contexto y commits:
- get_project_context — objetivo, stats de commits y último informe.
- list_commits — commits del proyecto (filtrable por dominio o contribuidor).
- get_story_commit_progress — commits que referencian la key de una HU (ej. ${proj.toUpperCase()}-123).

Objetivo e informes:
- get_objective / update_objective — leer y fijar el objetivo (guarda historial).
- get_evaluation — últimos informes de avance.
- publish_report — publica/actualiza un informe (idempotente por fecha+slot).

Notas (feedback):
- list_notes — notas del proyecto (filtrable por estado).
- answer_note — responde una nota y opcionalmente la liga a un informe.

Historias de Usuario:
- list_user_stories — HUs del proyecto (filtrable por estado/épica).
- create_user_story — crea una HU (narrativa role/want/benefit + criterios Given/When/Then).
- update_user_story — actualiza título, estado, prioridad o narrativa.
- assign_user_story — asigna/desasigna una HU a un contribuidor (sincroniza su tarjeta).
- list_contributors — contribuidores del proyecto (candidatos a asignar).

Kanban:
- list_board — tablero con columnas y tarjetas.
- create_card — crea una tarjeta (opcionalmente ligada a una HU).
- move_card — mueve una tarjeta de columna.
- link_story_to_card — liga una tarjeta existente a una HU sin tarjeta.

## Cómo operar
1. Si tu key es amplia, lista proyectos y pasa projectId. Si es de proyecto, llama a get_project_context.
2. Usa list_* para leer el estado real antes de crear o modificar nada.
3. Sé idempotente: publish_report ya lo es por fecha+slot; evita duplicar HUs o tarjetas.
4. Al escribir informes, fundaméntalos en list_commits y get_story_commit_progress, no inventes.
5. Si una acción falla por scope o rol, informa qué falta en vez de reintentar a ciegas.`;
  }, [newKey, ws, proj, projectId, scopeLevel]);

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    );

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      <TelegramChannelCard projectId={projectId} />

      <Card>
        <h3 className="text-h4 text-ink-900">Conectar un agente por MCP</h3>
        <p className="mt-2 text-body-sm text-ink-600">
          Tu agente se conecta a este endpoint con una API key. El alcance define si opera en
          este proyecto, en todo el workspace o en todos tus workspaces (pasando{" "}
          <code className="font-mono text-caption">projectId</code>).
        </p>
        <div className="mt-4 space-y-3">
          <CodeBlock title="MCP ENDPOINT">{MCP_URL}</CodeBlock>
          <CodeBlock command={snippet} title="bash" />
        </div>
      </Card>

      <Card>
        <h3 className="text-h4 text-ink-900">Prompt para tu agente</h3>
        <p className="mt-2 text-body-sm text-ink-600">
          Pega esto como <span className="font-medium">system prompt</span> de tu agente. Genera
          una API key abajo y reemplázala en el prompt.
        </p>
        <div className="mt-4">
          <CodeBlock command={systemPrompt} title="SYSTEM PROMPT" />
        </div>
      </Card>

      <Card>
        <h3 className="text-h4 text-ink-900">Generar API key</h3>
        <form onSubmit={createKey} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nombre (ej: hermes-prod)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="max-w-xs"
              aria-label="Nombre de API key"
            />
            <Select
              value={scopeLevel}
              onChange={(e) => setScopeLevel(e.target.value as ApiKeyScopeLevel)}
              aria-label="Alcance de la key"
            >
              {API_KEY_SCOPE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  Alcance: {SCOPE_LABELS[level]}
                </option>
              ))}
            </Select>
            {scopeLevel === "project" && (
              <Select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                aria-label="Agente asociado"
              >
                <option value="">— sin agente —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {scopeLevel !== "project" && (
            <p className="text-body-sm text-ink-500">
              Las tools de proyecto exigirán{" "}
              <code className="font-mono text-caption">projectId</code>. Usa{" "}
              <code className="font-mono text-caption">list_projects</code> para descubrirlos.
            </p>
          )}
          <div>
            <p className="mb-2 text-caption font-mono uppercase text-ink-500">Scopes</p>
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => (
                <label
                  key={s}
                  className={`cursor-pointer rounded-pill border px-2.5 py-1 font-mono text-caption font-medium transition-colors ${
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
            <p className="mb-2 text-body-sm font-medium text-[#8a5e0a]">
              Copia esta key ahora — no se vuelve a mostrar.
            </p>
            <CodeBlock title="API KEY">{newKey}</CodeBlock>
          </div>
        )}
      </Card>

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
                  className="flex items-start justify-between gap-3 -mx-6 px-6 py-3 hover:bg-surface-50"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink-900">
                      {k.name}{" "}
                      <code className="font-mono text-caption text-ink-400">{k.prefix}…</code>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="brand" mono>
                        {SCOPE_LABELS[(k.scopeLevel ?? "project") as ApiKeyScopeLevel]}
                      </Badge>
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

      <Card>
        <h3 className="text-h4 text-ink-900">Agentes</h3>
        <form onSubmit={createAgent} className="mt-4 flex gap-2">
          <Input
            placeholder="Nombre del agente (ej: hermes)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="max-w-xs"
            aria-label="Nombre del agente"
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
                  className="flex items-center justify-between -mx-6 px-6 py-2.5 hover:bg-surface-50"
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
