// Servicio F5: épicas e Historias de Usuario (HUs). El modelo canónico de una
// HU (narrativa role/want/benefit + criterios de aceptación Given/When/Then)
// vive en @pemie/shared. Las HUs se crean manualmente (REST) o las "genera" un
// agente vía MCP (create_user_story) — misma capa de servicios.

import { Prisma } from "@prisma/client";
import type {
  UserStoryStatus,
  UserStoryNarrative,
  AcceptanceCriterion,
} from "@pemie/shared";
import { prisma } from "../db.js";
import { badRequest, notFound } from "./errors.js";
import { projectWithAccess } from "./ingest.js";
import * as board from "./board.js";
import type { CardActor } from "./board.js";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES: UserStoryStatus[] = ["backlog", "ready", "in_progress", "review", "done"];

// ─── Épicas ─────────────────────────────────────────────────────────────

/** Crea una épica en el proyecto (member+). */
export async function createEpic(
  userId: string,
  projectId: string,
  input: { title: string; description?: string }
) {
  await projectWithAccess(userId, projectId, "member");
  const title = input.title.trim();
  if (title.length < 2) throw badRequest("El título de la épica es muy corto", "invalid_title");
  return prisma.epic.create({
    data: { projectId, title, description: input.description?.trim() || null },
  });
}

/** Lista las épicas de un proyecto con su conteo de HUs (viewer+). */
export async function listEpics(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return prisma.epic.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { stories: true } } },
  });
}

// ─── Historias de Usuario ───────────────────────────────────────────────

export interface CreateStoryInput {
  title: string;
  narrative?: UserStoryNarrative;
  acceptanceCriteria?: AcceptanceCriterion[];
  priority?: string;
  storyPoints?: number;
  epicId?: string;
  assigneeId?: string;
  status?: string;
}

export interface UpdateStoryInput {
  title?: string;
  narrative?: UserStoryNarrative;
  acceptanceCriteria?: AcceptanceCriterion[];
  priority?: string;
  storyPoints?: number | null;
  status?: string;
  epicId?: string | null;
  assigneeId?: string | null;
}

/** Actor que crea una HU: un usuario o un agente (F4 vía MCP). */
export interface StoryActor {
  createdById?: string | null;
  createdByAgentId?: string | null;
}

function validatePriority(p: string | undefined): string {
  if (p === undefined) return "medium";
  if (!PRIORITIES.includes(p as (typeof PRIORITIES)[number]))
    throw badRequest(`Prioridad inválida: ${p}`, "invalid_priority");
  return p;
}

function validateStatus(s: string | undefined): UserStoryStatus {
  if (s === undefined) return "backlog";
  if (!STATUSES.includes(s as UserStoryStatus))
    throw badRequest(`Estado inválido: ${s}`, "invalid_status");
  return s as UserStoryStatus;
}

const asJson = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Verifica que el contributor exista y pertenezca al proyecto de la HU. */
async function validateAssignee(projectId: string, assigneeId: string) {
  const contributor = await prisma.contributor.findUnique({ where: { id: assigneeId } });
  if (!contributor || contributor.projectId !== projectId)
    throw badRequest("El asignado no pertenece al proyecto", "assignee_mismatch");
}

/** Calcula la siguiente key (PRJ-N) a partir del prefijo del proyecto. */
async function nextStoryKey(projectId: string, prefix: string): Promise<string> {
  const stories = await prisma.userStory.findMany({ where: { projectId }, select: { key: true } });
  let max = 0;
  for (const s of stories) {
    const m = s.key.match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

/** Crea una HU (member+). */
export async function createStory(userId: string, projectId: string, input: CreateStoryInput) {
  await projectWithAccess(userId, projectId, "member");
  return opCreateStory(projectId, input, { createdById: userId });
}

/**
 * Operación (ya autorizada): crea la HU con una key incremental por proyecto.
 * Reintenta si dos creaciones concurrentes eligen la misma key (unique).
 */
export async function opCreateStory(
  projectId: string,
  input: CreateStoryInput,
  actor: StoryActor
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Proyecto no encontrado");
  const title = input.title.trim();
  if (title.length < 2) throw badRequest("El título de la HU es muy corto", "invalid_title");
  const priority = validatePriority(input.priority);
  const status = validateStatus(input.status);
  if (input.epicId) {
    const epic = await prisma.epic.findUnique({ where: { id: input.epicId } });
    if (!epic || epic.projectId !== projectId)
      throw badRequest("La épica no pertenece al proyecto", "epic_mismatch");
  }
  if (input.assigneeId) await validateAssignee(projectId, input.assigneeId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await nextStoryKey(projectId, project.key);
    try {
      return await prisma.userStory.create({
        data: {
          projectId,
          key,
          title,
          narrative: asJson(input.narrative),
          acceptanceCriteria: asJson(input.acceptanceCriteria),
          priority,
          status,
          storyPoints: input.storyPoints ?? null,
          epicId: input.epicId ?? null,
          assigneeId: input.assigneeId ?? null,
          createdById: actor.createdById ?? null,
          createdByAgentId: actor.createdByAgentId ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw badRequest("No se pudo asignar una key única a la HU", "key_collision");
}

export interface ListStoriesFilter {
  status?: string;
  epicId?: string;
}

/** Lista HUs de un proyecto (viewer+). */
export async function listStories(userId: string, projectId: string, filter: ListStoriesFilter = {}) {
  await projectWithAccess(userId, projectId);
  return opListStories(projectId, filter);
}

/** Operación (ya autorizada): lista HUs del proyecto. */
export function opListStories(projectId: string, filter: ListStoriesFilter = {}) {
  return prisma.userStory.findMany({
    where: {
      projectId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.epicId ? { epicId: filter.epicId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      epic: { select: { id: true, title: true } },
      assignee: { select: { id: true, githubLogin: true, name: true, avatarUrl: true } },
    },
  });
}

/** Carga una HU cruda por id (para que el transporte valide su proyecto). */
export function getStoryById(storyId: string) {
  return prisma.userStory.findUnique({ where: { id: storyId } });
}

/** Detalle de una HU (viewer+). */
export async function getStory(userId: string, storyId: string) {
  const story = await getStoryById(storyId);
  if (!story) throw notFound("HU no encontrada");
  await projectWithAccess(userId, story.projectId);
  return story;
}

/** Actualiza una HU (member+). */
export async function updateStory(userId: string, storyId: string, patch: UpdateStoryInput) {
  const story = await getStoryById(storyId);
  if (!story) throw notFound("HU no encontrada");
  await projectWithAccess(userId, story.projectId, "member");
  return opUpdateStory(story, patch);
}

/** Operación (ya autorizada): aplica el patch a una HU ya cargada. */
export async function opUpdateStory(
  story: { id: string; projectId: string },
  patch: UpdateStoryInput
) {
  const data: Prisma.UserStoryUpdateInput = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 2) throw badRequest("El título de la HU es muy corto", "invalid_title");
    data.title = t;
  }
  if (patch.priority !== undefined) data.priority = validatePriority(patch.priority);
  if (patch.status !== undefined) data.status = validateStatus(patch.status);
  if (patch.storyPoints !== undefined) data.storyPoints = patch.storyPoints;
  if (patch.narrative !== undefined) data.narrative = asJson(patch.narrative);
  if (patch.acceptanceCriteria !== undefined) data.acceptanceCriteria = asJson(patch.acceptanceCriteria);
  if (patch.epicId !== undefined) {
    if (patch.epicId) {
      const epic = await prisma.epic.findUnique({ where: { id: patch.epicId } });
      if (!epic || epic.projectId !== story.projectId)
        throw badRequest("La épica no pertenece al proyecto", "epic_mismatch");
      data.epic = { connect: { id: patch.epicId } };
    } else {
      data.epic = { disconnect: true };
    }
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId) {
      await validateAssignee(story.projectId, patch.assigneeId);
      data.assignee = { connect: { id: patch.assigneeId } };
    } else {
      data.assignee = { disconnect: true };
    }
  }
  return prisma.userStory.update({ where: { id: story.id }, data });
}

/**
 * Operación (ya autorizada): asigna (o desasigna, si `assigneeId` es null) una
 * HU a un contributor del proyecto. Si la HU tiene una Card vinculada, sincroniza
 * su assigneeId y registra la actividad en CardActivity.
 */
export async function opAssignStory(storyId: string, assigneeId: string | null, actor: CardActor) {
  const story = await getStoryById(storyId);
  if (!story) throw notFound("HU no encontrada");
  if (assigneeId) await validateAssignee(story.projectId, assigneeId);

  const updated = await prisma.userStory.update({
    where: { id: story.id },
    data: { assigneeId },
  });

  const card = await prisma.card.findUnique({ where: { userStoryId: story.id } });
  if (card) await board.opAssignCard(card, assigneeId, actor);

  return updated;
}

/** Lista los contribuidores del proyecto, candidatos a asignar HUs/tarjetas (viewer+). */
export async function listContributors(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return opListContributors(projectId);
}

/** Operación (ya autorizada): lista los contribuidores del proyecto. */
export function opListContributors(projectId: string) {
  return prisma.contributor.findMany({
    where: { projectId },
    orderBy: { githubLogin: "asc" },
    select: { id: true, githubLogin: true, name: true, avatarUrl: true },
  });
}

/** Cuenta y lista los commits del proyecto cuyo mensaje referencia la key de la HU (ej. PRJ-123). */
export async function opGetStoryCommitProgress(story: { id: string; projectId: string; key: string }) {
  const commits = await prisma.commit.findMany({
    where: { projectId: story.projectId, message: { contains: story.key, mode: "insensitive" } },
    orderBy: { committedAt: "desc" },
    select: { id: true, sha: true, message: true, committedAt: true },
  });
  return { storyId: story.id, key: story.key, commitCount: commits.length, commits };
}