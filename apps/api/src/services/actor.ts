import { prisma } from "../db.js";

export interface ActorRecord {
  actorType: string;
  actorId: string | null;
}

const FALLBACK_NAMES: Record<string, string> = {
  agent: "Agente no identificado",
  user: "Persona no identificada",
};

function fallbackActorName(actorType: string): string {
  return FALLBACK_NAMES[actorType] ?? "Actor no identificado";
}

/**
 * Resuelve los actores de una página con consultas batch, manteniendo un
 * fallback estable para ids nulos, borrados o ids de key sin agente asociado.
 */
export async function resolveActorNames<T extends ActorRecord>(
  records: readonly T[]
): Promise<Array<T & { actorName: string }>> {
  const userIds = [
    ...new Set(
      records
        .filter((record) => record.actorType === "user" && record.actorId)
        .map((record) => record.actorId as string)
    ),
  ];
  const agentIds = [
    ...new Set(
      records
        .filter((record) => record.actorType === "agent" && record.actorId)
        .map((record) => record.actorId as string)
    ),
  ];

  const [users, agents, apiKeys] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    }),
    prisma.apiKey.findMany({
      where: { id: { in: agentIds }, agentId: null },
      select: { id: true, name: true },
    }),
  ]);

  const names = new Map<string, string>();
  for (const user of users) names.set(`user:${user.id}`, user.name?.trim() || user.email);
  for (const agent of agents) names.set(`agent:${agent.id}`, agent.name);
  for (const apiKey of apiKeys) {
    names.set(`agent:${apiKey.id}`, `${apiKey.name} (key sin agente)`);
  }

  return records.map((record) => ({
    ...record,
    actorName:
      (record.actorId && names.get(`${record.actorType}:${record.actorId}`)) ??
      fallbackActorName(record.actorType),
  }));
}
