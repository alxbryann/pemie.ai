// Servicio: ranking de HUs cerradas por actor (persona o agente). Se arma agregando
// CardActivity — que ya registra cada movimiento de tarjeta con su actor real — en vez
// de usar `assigneeId` (identidad de git, siempre termina atribuyendo el trabajo del
// agente al humano dueño de la cuenta). El crédito es de quien movió la tarjeta a
// "Hecho", no de quien quedó como asignado.

import { prisma } from "../db.js";
import { projectWithAccess } from "./ingest.js";
import { resolveActorNames, type ActorRecord } from "./actor.js";

const DONE_COLUMN_NAME = "Hecho";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface LeaderboardEntry {
  actorType: string;
  actorId: string | null;
  actorName: string;
  storiesClosed: number;
  pointsDelivered: number;
  avgDaysToClose: number | null;
}

interface EntryAccumulator extends ActorRecord {
  storiesClosed: number;
  pointsDelivered: number;
  daysToCloseSamples: number[];
}

/** Ranking del proyecto: HUs cerradas, puntos entregados y velocidad por actor (viewer+). */
export async function projectLeaderboard(userId: string, projectId: string) {
  await projectWithAccess(userId, projectId);
  return opProjectLeaderboard(projectId);
}

/** Operación (ya autorizada): agrega CardActivity en memoria — sin tocar el schema. */
export async function opProjectLeaderboard(projectId: string): Promise<LeaderboardEntry[]> {
  const board = await prisma.board.findFirst({ where: { projectId }, select: { id: true } });
  if (!board) return [];

  const closeMoves = await prisma.cardActivity.findMany({
    where: { action: "moved", toValue: DONE_COLUMN_NAME, card: { boardId: board.id, type: "story" } },
    select: { actorType: true, actorId: true, cardId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (closeMoves.length === 0) return [];

  // Si una tarjeta se movió a "Hecho" más de una vez, cuenta solo el cierre más
  // reciente (el estado actual del tablero), no cada vaivén histórico.
  const latestCloseByCard = new Map<string, (typeof closeMoves)[number]>();
  for (const move of closeMoves) latestCloseByCard.set(move.cardId, move);

  const cardIds = [...latestCloseByCard.keys()];
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, createdAt: true, userStory: { select: { storyPoints: true } } },
  });
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const entries = new Map<string, EntryAccumulator>();
  for (const move of latestCloseByCard.values()) {
    const card = cardById.get(move.cardId);
    if (!card) continue; // tarjeta borrada desde entonces; se ignora, no rompe el ranking

    const key = `${move.actorType}:${move.actorId ?? "null"}`;
    const entry = entries.get(key) ?? {
      actorType: move.actorType,
      actorId: move.actorId,
      storiesClosed: 0,
      pointsDelivered: 0,
      daysToCloseSamples: [],
    };
    entry.storiesClosed += 1;
    entry.pointsDelivered += card.userStory?.storyPoints ?? 0;
    entry.daysToCloseSamples.push((move.createdAt.getTime() - card.createdAt.getTime()) / MS_PER_DAY);
    entries.set(key, entry);
  }

  const resolved = await resolveActorNames([...entries.values()]);

  return resolved
    .map(({ daysToCloseSamples, ...entry }) => ({
      ...entry,
      avgDaysToClose:
        daysToCloseSamples.length > 0
          ? Math.round((daysToCloseSamples.reduce((a, b) => a + b, 0) / daysToCloseSamples.length) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.pointsDelivered - a.pointsDelivered);
}
