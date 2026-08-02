// Servicio F4: agentes, API keys (con scopes + alcance) y AuditLog.
//
// Las API keys son el mecanismo de auth de los agentes (interfaz MCP). A
// diferencia de los usuarios —autorizados por rol de membresía— los agentes se
// autorizan por *scopes* de su key, intersectados con el rol del dueño en el
// workspace destino cuando la key es workspace/user. Cada acción de agente se
// registra en el AuditLog.

import { randomBytes, createHash } from "node:crypto";
import {
  API_SCOPES,
  API_KEY_SCOPE_LEVELS,
  type ApiScope,
  type ApiKeyScopeLevel,
  type ActorType,
  type Role,
} from "@pemie/shared";
import { Prisma, type ApiKey, type Project } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { requireMembership } from "./tenancy.js";
import { projectWithAccess } from "./ingest.js";
import { resolveActorNames } from "./actor.js";

const KEY_PREFIX = "pemie_sk_";
const VISIBLE_PREFIX_LEN = KEY_PREFIX.length + 6; // pemie_sk_ + 6 chars

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function isWriteScope(scope: ApiScope): boolean {
  return scope.endsWith(":write");
}

function parseScopeLevel(raw: string | undefined): ApiKeyScopeLevel {
  const level = (raw ?? "project") as ApiKeyScopeLevel;
  if (!(API_KEY_SCOPE_LEVELS as readonly string[]).includes(level))
    throw badRequest(`scopeLevel inválido: ${raw}`, "invalid_scope_level");
  return level;
}

// ─── Agentes ─────────────────────────────────────────────────────────────

/** Crea un agente en un proyecto (member+). */
export async function createAgent(
  userId: string,
  projectId: string,
  name: string,
  kind = "mcp"
) {
  await projectWithAccess(userId, projectId, "member");
  const trimmed = name.trim();
  if (trimmed.length < 2) throw badRequest("El nombre del agente es muy corto", "invalid_name");
  return prisma.agent.create({ data: { projectId, name: trimmed, kind } });
}

/** Lista los agentes de un proyecto (viewer+). */
export async function listAgents(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return prisma.agent.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { apiKeys: true } } },
  });
}

/** Lista los agentes de todos los proyectos del workspace (viewer+). */
export async function listAgentsInWorkspace(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId);
  return prisma.agent.findMany({
    where: { project: { workspaceId } },
    orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
    include: {
      _count: { select: { apiKeys: true } },
      project: { select: { id: true, name: true, slug: true, key: true } },
    },
  });
}

/**
 * Elimina un agente y revoca sus API keys (admin+, igual que revocar una key
 * suelta). Las keys se borran en la misma transacción: una key huérfana seguiría
 * autenticando sin agente detrás. Los informes que publicó se conservan —su
 * `agentId` queda en null— porque el historial del proyecto no es del agente.
 */
export async function deleteAgent(userId: string, agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { project: { select: { workspaceId: true } } },
  });
  if (!agent) throw notFound("Agente no encontrado");
  await requireMembership(userId, agent.project.workspaceId, "admin");

  await prisma.$transaction([
    prisma.apiKey.deleteMany({ where: { agentId } }),
    prisma.agent.delete({ where: { id: agentId } }),
  ]);
  await audit({
    workspaceId: agent.project.workspaceId,
    actorType: "user",
    actorId: userId,
    action: "agent.delete",
    entity: "Agent",
    entityId: agentId,
  });
  return { ok: true };
}

// ─── API keys ──────────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string;
  scopeLevel?: ApiKeyScopeLevel | string;
  projectId?: string;
  agentId?: string;
  scopes: string[];
  expiresAt?: Date;
  /** Si true, no exige admin (p. ej. auto-provisión Telegram). */
  skipAdminCheck?: boolean;
}

/**
 * Crea una API key en el workspace. Devuelve la key en claro **una sola vez**
 * (solo se guarda su hash). Niveles: project (default), workspace, user.
 */
export async function createApiKey(userId: string, workspaceId: string, input: CreateApiKeyInput) {
  if (!input.skipAdminCheck) {
    await requireMembership(userId, workspaceId, "admin");
  } else {
    await requireMembership(userId, workspaceId, "member");
  }

  const scopeLevel = parseScopeLevel(input.scopeLevel);
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("El nombre de la key es muy corto", "invalid_name");

  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) throw badRequest("Debes especificar al menos un scope", "no_scopes");
  const invalid = scopes.filter((s) => !API_SCOPES.includes(s as ApiScope));
  if (invalid.length) throw badRequest(`Scopes inválidos: ${invalid.join(", ")}`, "invalid_scopes");

  let projectId: string | null = null;
  let agentId: string | null = null;
  let ownerUserId: string | null = null;

  if (scopeLevel === "project") {
    if (!input.projectId)
      throw badRequest("Una key de proyecto requiere projectId", "project_required");
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project || project.workspaceId !== workspaceId)
      throw badRequest("El proyecto no pertenece al workspace", "project_mismatch");
    projectId = input.projectId;
    if (input.agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
      if (!agent || agent.projectId !== projectId)
        throw badRequest("El agente no pertenece al proyecto", "agent_mismatch");
      agentId = input.agentId;
    }
  } else if (scopeLevel === "workspace") {
    if (input.projectId || input.agentId)
      throw badRequest("Una key de workspace no lleva projectId ni agentId", "scope_mismatch");
    ownerUserId = userId;
  } else {
    // user
    if (input.projectId || input.agentId)
      throw badRequest("Una key de usuario no lleva projectId ni agentId", "scope_mismatch");
    ownerUserId = userId;
  }

  const raw = KEY_PREFIX + randomBytes(24).toString("hex");
  const created = await prisma.apiKey.create({
    data: {
      workspaceId,
      projectId,
      agentId,
      scopeLevel,
      ownerUserId,
      name,
      hashedKey: hashKey(raw),
      prefix: raw.slice(0, VISIBLE_PREFIX_LEN),
      scopes,
      expiresAt: input.expiresAt ?? null,
    },
  });

  await audit({
    workspaceId,
    actorType: "user",
    actorId: userId,
    action: "api_key.create",
    entity: "ApiKey",
    entityId: created.id,
    meta: { name, scopes, scopeLevel, projectId },
  });

  return { apiKey: publicApiKey(created), key: raw };
}

/** Vista pública de una API key (nunca incluye el hash). */
export function publicApiKey(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes as ApiScope[],
    scopeLevel: k.scopeLevel as ApiKeyScopeLevel,
    ownerUserId: k.ownerUserId,
    projectId: k.projectId,
    agentId: k.agentId,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
  };
}

/** Lista las API keys del workspace (admin+). Sin el hash. */
export async function listApiKeys(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "admin");
  const keys = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map(publicApiKey);
}

/** Revoca (borra) una API key. Admin del home WS, o dueño si user key. */
export async function revokeApiKey(userId: string, keyId: string) {
  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key) throw notFound("API key no encontrada");

  const isOwner = key.scopeLevel === "user" && key.ownerUserId === userId;
  if (!isOwner) {
    await requireMembership(userId, key.workspaceId, "admin");
  }

  await prisma.apiKey.delete({ where: { id: keyId } });
  await audit({
    workspaceId: key.workspaceId,
    actorType: "user",
    actorId: userId,
    action: "api_key.revoke",
    entity: "ApiKey",
    entityId: keyId,
  });
  return { ok: true };
}

/**
 * Autentica una API key en claro. Devuelve la key (con su scopes/proyecto) o
 * lanza 401. Actualiza `lastUsedAt`. Usado por la interfaz MCP.
 */
export async function authenticateApiKey(raw: string | undefined): Promise<ApiKey> {
  if (!raw || !raw.startsWith(KEY_PREFIX)) throw unauthorized("API key inválida");
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashKey(raw) } });
  if (!key) throw unauthorized("API key inválida");
  assertKeyUsable(key);
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return key;
}

/**
 * Vigencia de una key ya materializada. Vive aparte de `authenticateApiKey`
 * porque el canal Telegram invoca tools en-proceso con la key del registro, sin
 * pasar por el 401 de HTTP: ambos caminos deben aplicar las mismas reglas.
 */
export function assertKeyUsable(key: ApiKey) {
  if (key.expiresAt && key.expiresAt.getTime() < Date.now())
    throw unauthorized("API key expirada");
}

/** Exige que la key tenga el scope pedido; lanza 403 si no. */
export function requireScope(key: ApiKey, scope: ApiScope) {
  if (!(key.scopes as ApiScope[]).includes(scope))
    throw forbidden(`La API key no tiene el scope requerido: ${scope}`);
}

export interface ResolvedProject {
  project: Project;
  workspaceId: string;
}

/**
 * Resuelve el proyecto efectivo para una key según su alcance.
 * Keys amplias (workspace/user) exigen `projectIdFromArgs`.
 */
export async function resolveProjectForKey(
  key: ApiKey,
  projectIdFromArgs?: string | null
): Promise<ResolvedProject> {
  const level = key.scopeLevel as ApiKeyScopeLevel;

  if (level === "project") {
    if (!key.projectId)
      throw forbidden("Esta API key no está vinculada a un proyecto; créala con un projectId");
    if (projectIdFromArgs && projectIdFromArgs !== key.projectId)
      throw forbidden("Esta API key solo puede operar en su proyecto fijado");
    const project = await prisma.project.findUnique({ where: { id: key.projectId } });
    if (!project) throw notFound("Proyecto no encontrado");
    return { project, workspaceId: project.workspaceId };
  }

  if (!projectIdFromArgs)
    throw badRequest(
      "Esta API key requiere projectId en los argumentos de la tool (usa list_projects)",
      "project_id_required"
    );

  const project = await prisma.project.findUnique({ where: { id: projectIdFromArgs } });
  if (!project) throw notFound("Proyecto no encontrado");

  if (level === "workspace") {
    if (project.workspaceId !== key.workspaceId)
      throw forbidden("El proyecto no pertenece al workspace de esta API key");
  }

  // workspace | user: scopes ∩ membresía del dueño
  const ownerId = key.ownerUserId;
  if (!ownerId) throw forbidden("Esta API key no tiene dueño; revócala y crea una nueva");

  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { workspaceId: project.workspaceId, userId: ownerId } },
  });
  if (!membership) throw forbidden("El dueño de la key no es miembro del workspace del proyecto");

  return { project, workspaceId: project.workspaceId };
}

/**
 * Tras resolver el proyecto, exige scope en la key y rol mínimo según
 * write/read. Para keys de proyecto sin owner, solo exige el scope.
 */
export async function authorizeKeyForProject(key: ApiKey, scope: ApiScope, workspaceId: string) {
  requireScope(key, scope);

  const level = key.scopeLevel as ApiKeyScopeLevel;
  if (level === "project" && !key.ownerUserId) return;

  const ownerId = key.ownerUserId;
  if (!ownerId) return;

  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { workspaceId, userId: ownerId } },
  });
  if (!membership) throw forbidden("El dueño de la key no es miembro del workspace");

  const minRole: Role = isWriteScope(scope) ? "member" : "viewer";
  if (ROLE_RANK[membership.role as Role] < ROLE_RANK[minRole])
    throw forbidden(
      isWriteScope(scope)
        ? "Se requiere rol member+ para scopes de escritura"
        : "Se requiere rol viewer+ para este scope"
    );
}

/** Lista workspaces donde el dueño de la key es miembro (workspace/user keys). */
export async function listWorkspacesForKey(key: ApiKey) {
  const level = key.scopeLevel as ApiKeyScopeLevel;
  if (level === "project") {
    const ws = await prisma.workspace.findUnique({ where: { id: key.workspaceId } });
    return ws ? [{ id: ws.id, name: ws.name, slug: ws.slug }] : [];
  }
  if (!key.ownerUserId) return [];
  const memberships = await prisma.membership.findMany({
    where: { userId: key.ownerUserId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (level === "workspace") {
    return memberships
      .filter((m) => m.workspaceId === key.workspaceId)
      .map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug }));
  }
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
  }));
}

/** Lista proyectos accesibles para la key (opcionalmente filtrados por workspace). */
export async function listProjectsForKey(key: ApiKey, workspaceId?: string) {
  const level = key.scopeLevel as ApiKeyScopeLevel;

  if (level === "project") {
    if (!key.projectId) return [];
    const p = await prisma.project.findUnique({ where: { id: key.projectId } });
    return p
      ? [{ id: p.id, name: p.name, slug: p.slug, workspaceId: p.workspaceId, key: p.key }]
      : [];
  }

  if (!key.ownerUserId) return [];

  let workspaceIds: string[];
  if (level === "workspace") {
    workspaceIds = [key.workspaceId];
  } else {
    const memberships = await prisma.membership.findMany({
      where: { userId: key.ownerUserId },
      select: { workspaceId: true },
    });
    workspaceIds = memberships.map((m) => m.workspaceId);
  }

  if (workspaceId) {
    if (!workspaceIds.includes(workspaceId)) return [];
    workspaceIds = [workspaceId];
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId: { in: workspaceIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, workspaceId: true, key: true },
  });
  return projects;
}

// ─── AuditLog ────────────────────────────────────────────────────────────

export interface AuditInput {
  workspaceId: string;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: unknown;
}

/**
 * Registra una acción en el AuditLog. Best-effort: nunca hace fallar la
 * operación de negocio si la escritura del log falla.
 */
export async function audit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta == null ? Prisma.JsonNull : (input.meta as Prisma.InputJsonValue),
      },
    });
  } catch {
    // El AuditLog no debe tumbar la operación principal.
  }
}

/** Lista el AuditLog de un workspace, más reciente primero (admin+). */
export async function listAuditLogs(userId: string, workspaceId: string, limit = 100) {
  await requireMembership(userId, workspaceId, "admin");
  const logs = await prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return resolveActorNames(logs);
}

/** Lista el AuditLog de acciones de agentes en un proyecto, más reciente primero (viewer+). */
export async function listAuditLogsForProject(userId: string, projectId: string, limit = 100) {
  const project = await projectWithAccess(userId, projectId);
  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: project.workspaceId, entity: "Project", entityId: projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return resolveActorNames(logs);
}
