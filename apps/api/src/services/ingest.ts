// Servicio de ingesta (F2): vincula repos de GitHub a proyectos y registra sus
// commits, clasificándolos por dominio. Alimentado por dos vías:
//   - webhooks push (tiempo real)      -> ingestPushEvent
//   - backfill vía API (histórico)     -> backfillRepo
// Toda operación se scopea por proyecto y verifica el rol del usuario.

import { classifyCommit, DEFAULT_DOMAIN_CONFIG, type DomainConfig, type Role } from "@pemie/shared";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "./errors.js";
import { requireMembership } from "./tenancy.js";
import {
  fetchRecentCommits,
  githubAppConfigured,
  type NormalizedCommit,
} from "../lib/github-app.js";

/** Carga un proyecto verificando que el usuario tenga `minRole` en su workspace. */
export async function projectWithAccess(userId: string, projectId: string, minRole: Role = "viewer") {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Proyecto no encontrado");
  await requireMembership(userId, project.workspaceId, minRole);
  return project;
}

/** Carga un repo (con su proyecto) verificando acceso del usuario. */
async function repoWithAccess(userId: string, repoId: string, minRole: Role = "viewer") {
  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) throw notFound("Repo no encontrado");
  await projectWithAccess(userId, repo.projectId, minRole);
  return repo;
}

// ─── Repos ───────────────────────────────────────────────────────────────

export interface LinkRepoInput {
  owner: string;
  name: string;
  url?: string;
  externalId?: string;
  installationId?: string;
}

/** Vincula un repo de GitHub a un proyecto (member+). */
export async function linkRepo(userId: string, projectId: string, input: LinkRepoInput) {
  await projectWithAccess(userId, projectId, "member");
  const owner = input.owner.trim();
  const name = input.name.trim();
  if (!owner || !name) throw badRequest("Owner y nombre del repo son obligatorios", "invalid_repo");

  const existing = await prisma.repo.findUnique({
    where: { projectId_provider_owner_name: { projectId, provider: "github", owner, name } },
  });
  if (existing) throw conflict("Ese repo ya está vinculado al proyecto", "repo_exists");

  return prisma.repo.create({
    data: {
      projectId,
      provider: "github",
      owner,
      name,
      url: input.url?.trim() || `https://github.com/${owner}/${name}`,
      externalId: input.externalId ?? null,
      installationId: input.installationId ?? null,
    },
  });
}

/** Lista los repos vinculados a un proyecto, con conteo de commits (viewer+). */
export async function listRepos(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return prisma.repo.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      owner: true,
      name: true,
      url: true,
      installationId: true,
      createdAt: true,
      _count: { select: { commits: true } },
    },
  });
}

/** Desvincula un repo (member+). Elimina también sus commits por cascade. */
export async function unlinkRepo(userId: string, repoId: string) {
  const repo = await repoWithAccess(userId, repoId, "member");
  await prisma.repo.delete({ where: { id: repo.id } });
  return { ok: true };
}

// ─── Commits ─────────────────────────────────────────────────────────────

/**
 * Inserta commits normalizados en un repo: upsert de contribuidores,
 * clasificación por dominio e inserción idempotente vía `createMany` con
 * `skipDuplicates` (unique repoId+sha) — sin excepciones por duplicado, así los
 * webhooks re-entregados no ensucian los logs. Devuelve cuántos se registraron.
 */
async function recordCommits(
  repo: { id: string; projectId: string },
  commits: NormalizedCommit[]
): Promise<number> {
  const valid = commits.filter((c) => c.sha);
  if (valid.length === 0) return 0;

  const project = await prisma.project.findUnique({ where: { id: repo.projectId } });
  if (!project) return 0;
  const config = (project.domainConfig as DomainConfig | null) ?? DEFAULT_DOMAIN_CONFIG;

  // Upsert de contribuidores (login -> id), dedup por login dentro del batch.
  const contributorId = new Map<string, string>();
  for (const c of valid) {
    const login = (c.login || c.authorName || "desconocido").toString().trim() || "desconocido";
    if (contributorId.has(login)) continue;
    const contributor = await prisma.contributor.upsert({
      where: { projectId_githubLogin: { projectId: repo.projectId, githubLogin: login } },
      update: { name: c.authorName ?? undefined, avatarUrl: c.avatarUrl ?? undefined },
      create: { projectId: repo.projectId, githubLogin: login, name: c.authorName, avatarUrl: c.avatarUrl },
    });
    contributorId.set(login, contributor.id);
  }

  const { count } = await prisma.commit.createMany({
    data: valid.map((c) => {
      const login = (c.login || c.authorName || "desconocido").toString().trim() || "desconocido";
      return {
        projectId: repo.projectId,
        repoId: repo.id,
        contributorId: contributorId.get(login)!,
        sha: c.sha,
        message: c.message ?? "",
        domain: classifyCommit(c.message, config),
        committedAt: c.committedAt ?? new Date(),
      };
    }),
    skipDuplicates: true,
  });
  return count;
}

// ─── Webhook push ──────────────────────────────────────────────────────────

/** Estructura mínima de un evento `push` de GitHub que nos interesa. */
export interface PushEvent {
  installation?: { id: number };
  repository?: { name: string; owner?: { login?: string; name?: string } };
  commits?: {
    id: string;
    message: string;
    timestamp: string;
    author?: { name?: string; username?: string };
  }[];
}

/**
 * Procesa un evento push: localiza el/los repos vinculados que coincidan con
 * owner/name (y con la instalación, si viene) y registra sus commits. No lanza
 * si el repo no está vinculado: simplemente no ingesta (se reporta en la resp).
 */
export async function ingestPushEvent(payload: PushEvent) {
  const owner = payload.repository?.owner?.login ?? payload.repository?.owner?.name ?? null;
  const name = payload.repository?.name ?? null;
  const commits = payload.commits ?? [];
  const installationId = payload.installation?.id != null ? String(payload.installation.id) : null;

  if (!owner || !name) return { ingested: 0, reason: "evento sin repo" };

  const repos = await prisma.repo.findMany({ where: { provider: "github", owner, name } });
  // Si el push trae installationId, solo repos con esa instalación (o sin una fijada aún).
  const targets = installationId
    ? repos.filter((r) => !r.installationId || r.installationId === installationId)
    : repos;

  if (targets.length === 0) return { ingested: 0, reason: "repo no vinculado a ningún proyecto" };

  const normalized: NormalizedCommit[] = commits.map((c) => ({
    sha: c.id,
    message: c.message ?? "",
    committedAt: c.timestamp ? new Date(c.timestamp) : new Date(),
    login: c.author?.username ?? null,
    authorName: c.author?.name ?? null,
    avatarUrl: null,
  }));

  let ingested = 0;
  for (const repo of targets) {
    // Fija el installationId en el repo la primera vez que llega por webhook.
    if (installationId && !repo.installationId) {
      await prisma.repo.update({ where: { id: repo.id }, data: { installationId } });
    }
    ingested += await recordCommits(repo, normalized);
  }
  return { ingested, repos: targets.length };
}

/**
 * Backfill histórico de un repo vía la API de GitHub (member+). Requiere que el
 * repo tenga installationId y la GitHub App configurada.
 */
export async function backfillRepo(userId: string, repoId: string, since?: Date) {
  const repo = await repoWithAccess(userId, repoId, "member");
  if (!githubAppConfigured()) throw badRequest("GitHub App no configurada en el servidor", "github_app_unconfigured");
  if (!repo.installationId)
    throw badRequest("El repo no tiene installationId; vincúlalo vía la GitHub App", "missing_installation");

  const commits = await fetchRecentCommits(repo.installationId, repo.owner, repo.name, since);
  const ingested = await recordCommits(repo, commits);
  return { fetched: commits.length, ingested };
}

// ─── Lectura ───────────────────────────────────────────────────────────────

export interface ListCommitsFilter {
  limit?: number;
  domain?: string;
  contributorId?: string;
}

/** Lista commits de un proyecto, más recientes primero (viewer+). */
export async function listCommits(userId: string, projectId: string, filter: ListCommitsFilter = {}) {
  await projectWithAccess(userId, projectId);
  return opListCommits(projectId, filter);
}

/** Operación (ya autorizada): lista commits del proyecto. */
export function opListCommits(projectId: string, filter: ListCommitsFilter = {}) {
  const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  return prisma.commit.findMany({
    where: {
      projectId,
      ...(filter.domain ? { domain: filter.domain } : {}),
      ...(filter.contributorId ? { contributorId: filter.contributorId } : {}),
    },
    orderBy: { committedAt: "desc" },
    take,
    select: {
      id: true,
      sha: true,
      message: true,
      domain: true,
      committedAt: true,
      contributor: { select: { id: true, githubLogin: true, name: true, avatarUrl: true } },
      repo: { select: { id: true, owner: true, name: true } },
    },
  });
}
