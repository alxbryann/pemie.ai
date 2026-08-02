import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  API_SCOPES,
  API_KEY_SCOPE_LEVELS,
  buildAgentPrompt,
  type ApiScope,
  type ApiKeyScopeLevel,
} from "@pemie/shared";
import {
  api,
  analyticsFailureReason,
  ApiError,
  API_BASE,
  type ApiKeyPublic,
  type AuditLog,
  type ProjectSummary,
  type WorkspaceAgent,
  type Workspace as Ws,
} from "../../lib/api.js";
import { track } from "../../lib/analytics/index.js";
import { TelegramChannelCard } from "../../components/TelegramChannelCard.js";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  SkeletonCard,
  ToggleChip,
} from "../../components/ui.js";

const MCP_URL = `${API_BASE}/mcp`;

const SCOPE_LABELS: Record<ApiKeyScopeLevel, string> = {
  project: "Proyecto",
  workspace: "Workspace",
  user: "Usuario",
};

export default function WorkspaceAgents() {
  const { slug = "" } = useParams();
  const [ws, setWs] = useState<Ws | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [agents, setAgents] = useState<WorkspaceAgent[]>([]);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyName, setKeyName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [keyProjectId, setKeyProjectId] = useState("");
  const [scopeLevel, setScopeLevel] = useState<ApiKeyScopeLevel>("workspace");
  const [scopes, setScopes] = useState<string[]>([...API_SCOPES]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [agentName, setAgentName] = useState("");
  const [agentProjectSlug, setAgentProjectSlug] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);

  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyPublic | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const projectById = useMemo(() => {
    const m = new Map<string, ProjectSummary>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const agentsForKeyProject = useMemo(
    () => agents.filter((a) => a.project.id === keyProjectId),
    [agents, keyProjectId]
  );

  const agentById = useMemo(() => {
    const m = new Map<string, WorkspaceAgent>();
    for (const agent of agents) m.set(agent.id, agent);
    return m;
  }, [agents]);

  function applyAgentSelection(nextId: string) {
    const previousName = agentsForKeyProject.find((a) => a.id === agentId)?.name ?? "";
    const nextName = agentsForKeyProject.find((a) => a.id === nextId)?.name ?? "";
    setAgentId(nextId);
    setKeyName((current) =>
      current.trim() === "" || current === previousName ? nextName : current
    );
  }

  const selectedAgent = agentsForKeyProject.find((a) => a.id === agentId) ?? null;
  const nameIsDerived = selectedAgent !== null && keyName === selectedAgent.name;

  async function load() {
    setError(null);
    try {
      const [wsRes, projRes, agentsRes] = await Promise.all([
        api.workspaces.get(slug),
        api.projects.list(slug),
        api.agents.listWorkspace(slug),
      ]);
      // listApiKeys/listAuditLogs son admin+ en el backend: pedirlas como
      // member/viewer solo produce un 403. En vez de disfrazarlo de "sin datos"
      // (catch a []), directamente no se piden y la UI no muestra esas secciones.
      const canManageNow = wsRes.workspace.role === "owner" || wsRes.workspace.role === "admin";
      const [keysRes, auditRes] = canManageNow
        ? await Promise.all([api.apiKeys.list(slug), api.audit.list(slug)])
        : [{ apiKeys: [] as ApiKeyPublic[] }, { auditLogs: [] as AuditLog[] }];
      setWs(wsRes.workspace);
      setProjects(projRes.projects);
      setAgents(agentsRes.agents);
      setKeys(keysRes.apiKeys);
      setLogs(auditRes.auditLogs);
      if (!keyProjectId && projRes.projects[0]) setKeyProjectId(projRes.projects[0].id);
      if (!agentProjectSlug && projRes.projects[0]) setAgentProjectSlug(projRes.projects[0].slug);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar Agentes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (agentName.trim().length < 2 || !agentProjectSlug) return;
    setCreatingAgent(true);
    setError(null);
    try {
      await api.agents.create(slug, agentProjectSlug, agentName.trim());
      track("agent_registered");
      setAgentName("");
      await load();
    } catch (e) {
      track("agent_registered_failed", { reason: analyticsFailureReason(e) });
      setError(e instanceof ApiError ? e.message : "No se pudo crear el agente");
    } finally {
      setCreatingAgent(false);
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (keyName.trim().length < 2 || scopes.length === 0) return;
    if (scopeLevel === "project" && !keyProjectId) {
      setError("Elige un proyecto para una key de alcance proyecto");
      return;
    }
    setCreating(true);
    setError(null);
    setNewKey(null);
    try {
      const r = await api.apiKeys.create(slug, {
        name: keyName.trim(),
        scopeLevel,
        projectId: scopeLevel === "project" ? keyProjectId : undefined,
        agentId: scopeLevel === "project" && agentId ? agentId : undefined,
        scopes,
      });
      track("api_key_created", { scope_level: scopeLevel });
      setNewKey(r.key);
      applyAgentSelection("");
      setKeyName("");
      await load();
    } catch (e) {
      track("api_key_created_failed", { reason: analyticsFailureReason(e) });
      setError(e instanceof ApiError ? e.message : "No se pudo crear la API key");
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await api.apiKeys.revoke(slug, pendingRevoke.id);
      track("api_key_revoked");
      setPendingRevoke(null);
      await load();
    } catch (e) {
      setRevokeError(e instanceof ApiError ? e.message : "No se pudo revocar la API key");
    } finally {
      setRevoking(false);
    }
  }

  const snippet = useMemo(() => {
    const key = newKey ?? "<TU_API_KEY>";
    return `curl -X POST ${MCP_URL} \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
  }, [newKey]);

  const systemPrompt = useMemo(() => {
    const referenceProject = projects.find((p) => p.id === keyProjectId);
    if (scopeLevel === "project" && !referenceProject) return null;
    return buildAgentPrompt({
      workspaceSlug: slug,
      target: scopeLevel === "project"
        ? { scopeLevel: "project", project: { slug: referenceProject!.slug, id: referenceProject!.id } }
        : {
            scopeLevel,
            ...(referenceProject ? { referenceProject: { slug: referenceProject.slug, id: referenceProject.id } } : {}),
          },
      scopes: scopes as ApiScope[],
      keyRef: { kind: "plaintext", key: newKey ?? "<TU_API_KEY>" },
      mcpUrl: MCP_URL,
    });
  }, [newKey, slug, scopeLevel, keyProjectId, projects, scopes]);

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="mb-8 h-9 w-48" />
        <div className="space-y-6">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  if (!ws) {
    return (
      <Card>
        <ErrorText>{error ?? "Workspace no encontrado"}</ErrorText>
      </Card>
    );
  }

  const canManage = ws.role === "owner" || ws.role === "admin";

  return (
    <div>
      <Link to={`/w/${slug}`} className="mb-1 block text-body-sm text-ink-400 hover:text-ink-700">
        ← {ws.name}
      </Link>
      <PageHeader
        title="Agentes"
        description="MCP, API keys, Telegram y actividad de agentes en este workspace."
      />

      <div className="space-y-6">
        <ErrorText>{error}</ErrorText>

        <TelegramChannelCard
          projects={projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
        />

        <Card>
          <h3 className="text-h4 text-ink-900">Conectar un agente por MCP</h3>
          <p className="mt-2 text-body-sm text-ink-600">
            Tu agente se conecta a este endpoint con una API key. El alcance define si opera en
            un proyecto, en todo el workspace o en todos tus workspaces (pasando{" "}
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
            {systemPrompt ? (
              <CodeBlock command={systemPrompt.text} title="SYSTEM PROMPT" />
            ) : (
              <ErrorText>Elige un proyecto antes de generar un prompt de alcance proyecto.</ErrorText>
            )}
          </div>
        </Card>

        {canManage && (
          <Card>
            <h3 className="text-h4 text-ink-900">Generar API key</h3>
            <form onSubmit={createKey} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Alcance">
                  <Select
                    value={scopeLevel}
                    onChange={(e) => {
                      setScopeLevel(e.target.value as ApiKeyScopeLevel);
                      applyAgentSelection("");
                    }}
                  >
                    {API_KEY_SCOPE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {SCOPE_LABELS[level]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {scopeLevel === "project" && (
                  <>
                    <Field label="Proyecto">
                      <Select
                        value={keyProjectId}
                        onChange={(e) => {
                          setKeyProjectId(e.target.value);
                          applyAgentSelection("");
                        }}
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Agente">
                      <Select value={agentId} onChange={(e) => applyAgentSelection(e.target.value)}>
                        <option value="">— sin agente —</option>
                        {agentsForKeyProject.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
                <Field
                  label="Nombre de la key"
                  hint={
                    nameIsDerived
                      ? "Autocompletado desde el agente — puedes ajustarlo."
                      : keyName.trim().length < 2
                        ? "Mínimo 2 caracteres."
                        : undefined
                  }
                >
                  <Input
                    placeholder="Ej: hermes-prod"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </Field>
              </div>
              {scopeLevel !== "project" && (
                <p className="text-body-sm text-ink-500">
                  Las keys de alcance workspace y usuario no se pueden asociar a un agente; escribe
                  el nombre de la key manualmente. Las tools de proyecto exigirán{" "}
                  <code className="font-mono text-caption">projectId</code>. Usa{" "}
                  <code className="font-mono text-caption">list_projects</code> para descubrirlos.
                </p>
              )}
              <div>
                <p className="mb-2 text-caption font-mono uppercase text-ink-500">Scopes</p>
                <div className="flex flex-wrap gap-2">
                  {API_SCOPES.map((s) => (
                    <ToggleChip key={s} checked={scopes.includes(s)} onChange={() => toggleScope(s)}>
                      {s}
                    </ToggleChip>
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
                <p className="mb-2 text-body-sm font-medium text-amber-700">
                  Copia esta key ahora — no se vuelve a mostrar.
                </p>
                <CodeBlock title="API KEY">{newKey}</CodeBlock>
              </div>
            )}
          </Card>
        )}

        {canManage && (
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
                  {keys.map((k) => {
                    const proj = k.projectId ? projectById.get(k.projectId) : null;
                    const agent = k.agentId ? agentById.get(k.agentId) : null;
                    return (
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
                              {SCOPE_LABELS[k.scopeLevel as ApiKeyScopeLevel]}
                            </Badge>
                            {proj && (
                              <Badge tone="neutral" mono>
                                {proj.slug}
                              </Badge>
                            )}
                            {agent && (
                              <Badge tone="success" mono>
                                {agent.name}
                              </Badge>
                            )}
                            {k.scopes.map((s) => (
                              <Badge key={s} tone="neutral" mono>
                                {s}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-1 font-mono text-caption text-ink-400">
                            creada {new Date(k.createdAt).toLocaleString()} · {k.lastUsedAt
                              ? `último uso ${new Date(k.lastUsedAt).toLocaleString()}`
                              : "sin usar aún"}
                          </p>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setPendingRevoke(k)}
                        >
                          Revocar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="text-h4 text-ink-900">Agentes</h3>
          <p className="mt-2 text-body-sm text-ink-600">
            Los agentes viven en un proyecto; aquí ves todos los del workspace.
          </p>
          <form onSubmit={createAgent} className="mt-4 flex flex-wrap gap-2">
            <Select
              value={agentProjectSlug}
              onChange={(e) => setAgentProjectSlug(e.target.value)}
              aria-label="Proyecto del agente"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Nombre del agente (ej: hermes)"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="max-w-xs"
              aria-label="Nombre del agente"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={creatingAgent || projects.length === 0}
            >
              {creatingAgent ? "Añadiendo…" : "Añadir agente"}
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
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="max-w-[14rem] truncate text-body font-medium text-ink-900">
                        {a.name}
                      </span>
                      <Badge tone="neutral" mono>
                        {a.project.slug}
                      </Badge>
                      <span className="font-mono text-caption text-ink-400">
                        {a._count.apiKeys} keys
                      </span>
                    </div>
                    <Link
                      to={`/w/${slug}/p/${a.project.slug}`}
                      className="shrink-0 text-caption text-blue-700 hover:underline"
                    >
                      Ir al proyecto
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {canManage && (
          <Card>
            <h3 className="text-h4 text-ink-900">Actividad del workspace</h3>
            <p className="mt-2 text-body-sm text-ink-600">
              Audit de lo que hacen las API keys y agentes en este workspace.
            </p>
            <div className="mt-4">
              {logs.length === 0 ? (
                <EmptyState
                  title="Sin actividad"
                  description="Las acciones de agentes y keys aparecerán aquí."
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
        )}
      </div>

      {pendingRevoke && (
        <Modal
          title="Revocar API key"
          onClose={() => {
            if (!revoking) {
              setPendingRevoke(null);
              setRevokeError(null);
            }
          }}
        >
          <div className="space-y-4">
            <ErrorText>{revokeError}</ErrorText>
            <p className="text-body text-ink-700">
              ¿Revocar{" "}
              <span className="font-medium text-ink-900">{pendingRevoke.name}</span>{" "}
              <code className="font-mono text-caption text-ink-400">{pendingRevoke.prefix}…</code>?
              Esta acción no se puede deshacer: cualquier agente que use esta key perderá el
              acceso de inmediato.
            </p>
            <div className="flex justify-end gap-2 border-t border-line-100 pt-4">
              <Button
                variant="secondary"
                disabled={revoking}
                onClick={() => {
                  setPendingRevoke(null);
                  setRevokeError(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="danger" disabled={revoking} onClick={confirmRevoke}>
                {revoking ? "Revocando…" : "Revocar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
