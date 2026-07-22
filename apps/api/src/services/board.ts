// Servicio F6: Kanban. Cada proyecto tiene un tablero con columnas por defecto;
// las tarjetas se mueven entre columnas y cada movimiento/cambio se registra en
// CardActivity. Las tarjetas pueden colgar de una HU (F5). Consumible por REST
// (usuarios) y por MCP (agentes: list_board / create_card / move_card).

import { Prisma } from "@prisma/client";
import type { ActorType, CardType } from "@pemie/shared";
import { prisma } from "../db.js";
import { badRequest, notFound } from "./errors.js";
import { projectWithAccess } from "./ingest.js";

const CARD_TYPES: CardType[] = ["story", "task", "bug"];
const DEFAULT_COLUMNS = [
  { name: "Backlog", order: 0 },
  { name: "Por hacer", order: 1 },
  { name: "En progreso", order: 2 },
  { name: "Revisión", order: 3 },
  { name: "Hecho", order: 4 },
];

const asJson = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Actor de una acción sobre una tarjeta (usuario o agente). */
export interface CardActor {
  actorType: ActorType;
  actorId?: string | null;
}

/** Devuelve el tablero del proyecto, creándolo con columnas por defecto si no existe. */
async function ensureBoard(projectId: string) {
  const existing = await prisma.board.findFirst({ where: { projectId } });
  if (existing) return existing;
  return prisma.board.create({
    data: { projectId, name: "Board", columns: { create: DEFAULT_COLUMNS } },
  });
}

function recordActivity(
  cardId: string,
  actor: CardActor,
  action: string,
  fromValue: string | null,
  toValue: string | null
) {
  return prisma.cardActivity.create({
    data: {
      cardId,
      actorType: actor.actorType,
      actorId: actor.actorId ?? null,
      action,
      fromValue,
      toValue,
    },
  });
}

// ─── Lectura del tablero ───────────────────────────────────────────────────

/** Tablero del proyecto con columnas y tarjetas ordenadas (viewer+). */
export async function getBoard(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return opListBoard(projectId);
}

/** Operación (ya autorizada): tablero con columnas y sus tarjetas. */
export async function opListBoard(projectId: string) {
  const board = await ensureBoard(projectId);
  return prisma.board.findUnique({
    where: { id: board.id },
    include: {
      columns: {
        orderBy: { order: "asc" },
        include: {
          cards: {
            orderBy: { order: "asc" },
            include: {
              userStory: { select: { id: true, key: true, title: true, status: true } },
              assignee: { select: { id: true, githubLogin: true, name: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  });
}

// ─── Tarjetas ──────────────────────────────────────────────────────────────

export interface CreateCardInput {
  title: string;
  type?: string;
  description?: string;
  columnId?: string;
  userStoryId?: string;
  assigneeId?: string;
  labels?: unknown;
}

/** Carga una tarjeta con el proyecto de su tablero (para validar acceso). */
async function cardWithProject(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { board: { select: { projectId: true } } },
  });
  if (!card) throw notFound("Tarjeta no encontrada");
  return card;
}

/** Crea una tarjeta en el tablero (member+). */
export async function createCard(userId: string, projectId: string, input: CreateCardInput) {
  await projectWithAccess(userId, projectId, "member");
  return opCreateCard(projectId, input, { actorType: "user", actorId: userId });
}

/** Operación (ya autorizada): crea la tarjeta al final de su columna. */
export async function opCreateCard(projectId: string, input: CreateCardInput, actor: CardActor) {
  const board = await ensureBoard(projectId);
  const title = input.title.trim();
  if (title.length < 1) throw badRequest("El título de la tarjeta está vacío", "empty_title");

  const type = input.type ?? "task";
  if (!CARD_TYPES.includes(type as CardType)) throw badRequest(`Tipo inválido: ${type}`, "invalid_type");

  const columns = await prisma.column.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } });
  const column = input.columnId ? columns.find((col) => col.id === input.columnId) : columns[0];
  if (!column) throw badRequest("Columna inválida para este tablero", "invalid_column");

  if (input.userStoryId) {
    const story = await prisma.userStory.findUnique({ where: { id: input.userStoryId } });
    if (!story || story.projectId !== projectId)
      throw badRequest("La HU no pertenece al proyecto", "story_mismatch");
    const existing = await prisma.card.findUnique({ where: { userStoryId: input.userStoryId } });
    if (existing) throw badRequest("Esa HU ya tiene una tarjeta", "story_has_card");
  }

  const last = await prisma.card.findFirst({
    where: { columnId: column.id },
    orderBy: { order: "desc" },
  });
  const order = (last?.order ?? 0) + 1;

  const card = await prisma.card.create({
    data: {
      boardId: board.id,
      columnId: column.id,
      order,
      type,
      title,
      description: input.description?.trim() || null,
      userStoryId: input.userStoryId ?? null,
      assigneeId: input.assigneeId ?? null,
      labels: asJson(input.labels),
    },
  });
  await recordActivity(card.id, actor, "created", null, column.name);
  return card;
}

/** Mueve una tarjeta a otra columna/posición (member+). */
export async function moveCard(
  userId: string,
  cardId: string,
  target: { columnId: string; order?: number }
) {
  const card = await cardWithProject(cardId);
  await projectWithAccess(userId, card.board.projectId, "member");
  return opMoveCard(card, target, { actorType: "user", actorId: userId });
}

/** Operación (ya autorizada): mueve la tarjeta y registra la actividad. */
export async function opMoveCard(
  card: { id: string; boardId: string; columnId: string },
  target: { columnId: string; order?: number },
  actor: CardActor
) {
  const [fromColumn, toColumn] = await Promise.all([
    prisma.column.findUnique({ where: { id: card.columnId } }),
    prisma.column.findUnique({ where: { id: target.columnId } }),
  ]);
  if (!toColumn || toColumn.boardId !== card.boardId)
    throw badRequest("La columna destino no pertenece al tablero", "invalid_column");

  let order = target.order;
  if (order === undefined) {
    const last = await prisma.card.findFirst({
      where: { columnId: toColumn.id },
      orderBy: { order: "desc" },
    });
    order = (last?.order ?? 0) + 1;
  }

  const updated = await prisma.card.update({
    where: { id: card.id },
    data: { columnId: toColumn.id, order },
  });
  await recordActivity(card.id, actor, "moved", fromColumn?.name ?? null, toColumn.name);
  return updated;
}

/**
 * Operación (ya autorizada): reasigna una tarjeta y registra la actividad. Usada
 * al sincronizar el assignee de la HU vinculada (ver stories.opAssignStory).
 */
export async function opAssignCard(
  card: { id: string; assigneeId: string | null },
  assigneeId: string | null,
  actor: CardActor
) {
  const updated = await prisma.card.update({ where: { id: card.id }, data: { assigneeId } });
  await recordActivity(card.id, actor, "assigned", card.assigneeId, assigneeId);
  return updated;
}

/**
 * Operación (ya autorizada): vincula una tarjeta existente a una HU sin tarjeta.
 * Falla si la HU ya tiene otra tarjeta vinculada.
 */
export async function opLinkStoryToCard(
  card: { id: string },
  story: { id: string },
  actor: CardActor
) {
  const existing = await prisma.card.findUnique({ where: { userStoryId: story.id } });
  if (existing && existing.id !== card.id)
    throw badRequest("Esa HU ya tiene una tarjeta", "story_has_card");

  const updated = await prisma.card.update({ where: { id: card.id }, data: { userStoryId: story.id } });
  await recordActivity(card.id, actor, "linked_story", null, story.id);
  return updated;
}

export interface UpdateCardInput {
  title?: string;
  description?: string | null;
  type?: string;
  assigneeId?: string | null;
  labels?: unknown;
}

/** Actualiza campos de una tarjeta (member+). */
export async function updateCard(userId: string, cardId: string, patch: UpdateCardInput) {
  const card = await cardWithProject(cardId);
  await projectWithAccess(userId, card.board.projectId, "member");

  const data: Prisma.CardUpdateInput = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 1) throw badRequest("El título está vacío", "empty_title");
    data.title = t;
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.type !== undefined) {
    if (!CARD_TYPES.includes(patch.type as CardType)) throw badRequest(`Tipo inválido: ${patch.type}`, "invalid_type");
    data.type = patch.type;
  }
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId;
  if (patch.labels !== undefined) data.labels = asJson(patch.labels);

  return prisma.card.update({ where: { id: card.id }, data });
}

/** Carga una tarjeta cruda por id (para que el transporte valide su proyecto). */
export function getCardWithProject(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId },
    include: { board: { select: { projectId: true } } },
  });
}
