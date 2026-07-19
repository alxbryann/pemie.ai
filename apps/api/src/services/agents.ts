// Servicio F4: agentes, API keys (con scopes) y AuditLog.
//
// Las API keys son el mecanismo de auth de los agentes (interfaz MCP). A
// diferencia de los usuarios —autorizados por rol de membresía— los agentes se
// autorizan por *scopes* de su key, acotados a un proyecto. Cada acción de
// agente se registra en el AuditLog.

import { randomBytes, createHash } from "node:crypto";
import { API_SCOPES, type ApiScope, type ActorType } from "@pemie/shared";
import { Prisma, type ApiKey } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { requireMembership } from "./tenancy.js";
import { projectWithAccess } from "./ingest.js";

const KEY_PREFIX = "pemie_sk_";
const VISIBLE_PREFIX_LEN = KEY_PREFIX.length + 6; // pemie_sk_ + 6 chars

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
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

// ─── API keys ──────────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string;
  projectId?: string;
  agentId?: string;
  scopes: string[];
  expiresAt?: Date;
}

/**
 * Crea una API key en el workspace (admin+). Devuelve la key en claro **una
 * sola vez** (solo se guarda su hash). Valida scopes y que project/agent
 * pertenezcan al workspace.
 */
export async function createApiKey(userId: string, workspaceId: string, input: CreateApiKeyInput) {
  await requireMembership(userId, workspaceId, "admin");

  const name = input.name.trim();
  if (name.length < 2) throw badRequest("El nombre de la key es muy corto", "invalid_name");

  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) throw badRequest("Debes especificar al menos un scope", "no_scopes");
  const invalid = scopes.filter((s) => !API_SCOPES.includes(s as ApiScope));
  if (invalid.length) throw badRequest(`Scopes inválidos: ${invalid.join(", ")}`, "invalid_scopes");

  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project || project.workspaceId !== workspaceId)
      throw badRequest("El proyecto no pertenece al workspace", "project_mismatch");
  }
  if (input.agentId) {
    if (!input.projectId) throw badRequest("Una key con agente debe fijar un proyecto", "agent_needs_project");
    const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!agent || agent.projectId !== input.projectId)
      throw badRequest("El agente no pertenece al proyecto", "agent_mismatch");
  }

  const raw = KEY_PREFIX + randomBytes(24).toString("hex");
  const created = await prisma.apiKey.create({
    data: {
      workspaceId,
      projectId: input.projectId ?? null,
      agentId: input.agentId ?? null,
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
    meta: { name, scopes, projectId: input.projectId ?? null },
  });

  // La key en claro solo se devuelve aquí; no se puede recuperar después.
  return { apiKey: publicApiKey(created), key: raw };
}

/** Vista pública de una API key (nunca incluye el hash). */
export function publicApiKey(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes as ApiScope[],
    projectId: k.projectId,
    agentId: k.agentId,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
  };
}

/** Lista las API keys de un workspace (admin+). Sin el hash. */
export async function listApiKeys(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "admin");
  const keys = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map(publicApiKey);
}

/** Revoca (borra) una API key (admin+). */
export async function revokeApiKey(userId: string, keyId: string) {
  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key) throw notFound("API key no encontrada");
  await requireMembership(userId, key.workspaceId, "admin");
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
  if (key.expiresAt && key.expiresAt.getTime() < Date.now())
    throw unauthorized("API key expirada");
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return key;
}

/** Exige que la key tenga el scope pedido; lanza 403 si no. */
export function requireScope(key: ApiKey, scope: ApiScope) {
  if (!(key.scopes as ApiScope[]).includes(scope))
    throw forbidden(`La API key no tiene el scope requerido: ${scope}`);
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
  return prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}
