// Canal Telegram: vincular cuenta, BYOK Anthropic, user MCP key.
// El bot no guarda la MCP key en claro: usa el registro ApiKey vía invokeMcpTool.

import { randomBytes } from "node:crypto";
import {
  API_SCOPES,
  CHANNEL_LLM_PROVIDERS,
  CHANNEL_LLM_DEFAULT_MODELS,
  type ChannelLlmProvider,
} from "@pemie/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { encryptSecret } from "../lib/secrets.js";
import { badRequest, forbidden, notFound } from "./errors.js";
import * as agents from "./agents.js";

const LINK_TTL_MS = 15 * 60 * 1000;
const PROVIDER = "telegram";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
/** Retención de updates vistos: cubre de sobra la ventana de reintentos. */
const UPDATE_RETENTION_MS = 24 * 60 * 60 * 1000;

function botUsernameFromToken(_token: string | undefined): string | null {
  return env.TELEGRAM_BOT_USERNAME?.trim() || null;
}

function parseLlmProvider(raw: string | undefined | null): ChannelLlmProvider {
  const p = (raw ?? "anthropic") as ChannelLlmProvider;
  if (!(CHANNEL_LLM_PROVIDERS as readonly string[]).includes(p))
    throw badRequest(`Proveedor LLM inválido: ${raw}`, "invalid_llm_provider");
  return p;
}

function validateLlmKey(provider: ChannelLlmProvider, key: string) {
  if (key.length < 20) throw badRequest("La API key es demasiado corta", "invalid_llm_key");
  if (provider === "anthropic") {
    if (!key.startsWith("sk-ant-") && !key.startsWith("sk-"))
      throw badRequest("La key de Anthropic no parece válida (sk-ant-…)", "invalid_llm_key");
  } else if (provider === "openai") {
    if (!key.startsWith("sk-"))
      throw badRequest("La key de OpenAI no parece válida (sk-…)", "invalid_llm_key");
  }
  // deepseek: acepta sk-… u otros prefijos comerciales
}

/** Estado del canal Telegram del usuario (sin secretos). */
export async function getChannelStatus(userId: string) {
  const [link, config] = await Promise.all([
    prisma.channelLink.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } }),
    prisma.userChannelConfig.findUnique({
      where: { userId },
      include: { apiKey: true, defaultProject: { select: { id: true, name: true, slug: true } } },
    }),
  ]);

  const botConfigured = Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  const botUsername = botUsernameFromToken(env.TELEGRAM_BOT_TOKEN);
  const llmProvider = (CHANNEL_LLM_PROVIDERS as readonly string[]).includes(config?.llmProvider ?? "")
    ? (config!.llmProvider as ChannelLlmProvider)
    : "anthropic";

  return {
    botConfigured,
    botUsername,
    linked: Boolean(link),
    telegramUsername: link?.username ?? null,
    linkedAt: link?.linkedAt ?? null,
    enabled: config?.enabled ?? false,
    hasLlmKey: Boolean(config?.llmKeyCiphertext),
    llmKeyLast4: config?.llmKeyLast4 ?? null,
    llmProvider,
    model: config?.model ?? CHANNEL_LLM_DEFAULT_MODELS[llmProvider],
    defaultProject: config?.defaultProject ?? null,
    apiKeyPrefix: config?.apiKey?.prefix ?? null,
    ready: Boolean(link && config?.enabled && config.llmKeyCiphertext),
  };
}

/**
 * Crea un token one-shot para deep link t.me/Bot?start=<token>.
 * Al completar el link se asegura UserChannelConfig + user MCP key.
 */
export async function createLinkToken(userId: string, projectId?: string | null) {
  if (!env.TELEGRAM_BOT_TOKEN?.trim())
    throw badRequest("Telegram no está configurado en el servidor", "telegram_not_configured");

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound("Proyecto no encontrado");
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { workspaceId: project.workspaceId, userId } },
    });
    if (!membership) throw forbidden("No eres miembro del workspace del proyecto");
  }

  const token = randomBytes(24).toString("hex");
  const row = await prisma.channelLinkToken.create({
    data: {
      token,
      userId,
      projectId: projectId ?? null,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    },
  });

  const botUsername = botUsernameFromToken(env.TELEGRAM_BOT_TOKEN);
  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=${token}`
    : null;

  return {
    token: row.token,
    expiresAt: row.expiresAt,
    deepLink,
    // Fallback si no hay username: el usuario pega /start <token> en el bot.
    startPayload: token,
  };
}

/**
 * Completa el vínculo desde el webhook /start <token>.
 * Crea o reutiliza UserChannelConfig + ApiKey user-scoped.
 */
export async function completeLinkFromToken(
  token: string,
  telegramUserId: string,
  telegramUsername?: string | null
) {
  const row = await prisma.channelLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt) throw badRequest("Token de vínculo inválido o ya usado", "invalid_link_token");
  if (row.expiresAt.getTime() < Date.now())
    throw badRequest("Token de vínculo expirado; genera uno nuevo desde Pemie", "link_token_expired");

  const userId = row.userId;

  // Si otro usuario Pemie ya tiene este telegram, o este user tiene otro telegram: reemplazar.
  await prisma.$transaction(async (tx) => {
    await tx.channelLink.deleteMany({
      where: {
        OR: [
          { provider: PROVIDER, externalId: telegramUserId },
          { userId, provider: PROVIDER },
        ],
      },
    });
    await tx.channelLink.create({
      data: {
        userId,
        provider: PROVIDER,
        externalId: telegramUserId,
        username: telegramUsername ?? null,
      },
    });
    await tx.channelLinkToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  });

  await ensureUserChannelConfig(userId, row.projectId);
  return { userId, projectId: row.projectId };
}

/** Asegura config + user MCP key (reutiliza si ya existe). */
export async function ensureUserChannelConfig(userId: string, defaultProjectId?: string | null) {
  const existing = await prisma.userChannelConfig.findUnique({ where: { userId } });
  if (existing) {
    if (defaultProjectId && !existing.defaultProjectId) {
      return prisma.userChannelConfig.update({
        where: { userId },
        data: { defaultProjectId, enabled: true },
      });
    }
    if (!existing.enabled) {
      return prisma.userChannelConfig.update({
        where: { userId },
        data: { enabled: true },
      });
    }
    return existing;
  }

  // Home workspace: del default project, o el primero donde sea member.
  let workspaceId: string | null = null;
  if (defaultProjectId) {
    const p = await prisma.project.findUnique({ where: { id: defaultProjectId } });
    workspaceId = p?.workspaceId ?? null;
  }
  if (!workspaceId) {
    const m = await prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    workspaceId = m?.workspaceId ?? null;
  }
  if (!workspaceId) throw badRequest("Necesitas un workspace para conectar Telegram", "no_workspace");

  const { apiKey } = await agents.createApiKey(userId, workspaceId, {
    name: "Telegram bot",
    scopeLevel: "user",
    scopes: [...API_SCOPES],
    skipAdminCheck: true,
  });

  // createApiKey returns public view; we need the id
  return prisma.userChannelConfig.create({
    data: {
      userId,
      apiKeyId: apiKey.id,
      defaultProjectId: defaultProjectId ?? null,
      enabled: true,
    },
  });
}

/** Guarda / actualiza la LLM key del usuario (cifrada) y el proveedor. */
export async function setLlmKey(
  userId: string,
  rawKey: string,
  opts?: { provider?: string; model?: string }
) {
  const provider = parseLlmProvider(opts?.provider ?? "anthropic");
  const trimmed = rawKey.trim();
  validateLlmKey(provider, trimmed);

  await ensureUserChannelConfig(userId);
  const ciphertext = encryptSecret(trimmed);
  const last4 = trimmed.slice(-4);
  const model = opts?.model?.trim() || CHANNEL_LLM_DEFAULT_MODELS[provider];

  return prisma.userChannelConfig.update({
    where: { userId },
    data: {
      llmProvider: provider,
      llmKeyCiphertext: ciphertext,
      llmKeyLast4: last4,
      model,
      enabled: true,
    },
  });
}

export async function setDefaultProject(userId: string, projectId: string | null) {
  await ensureUserChannelConfig(userId);
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound("Proyecto no encontrado");
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { workspaceId: project.workspaceId, userId } },
    });
    if (!membership) throw forbidden("No eres miembro del workspace del proyecto");
  }
  return prisma.userChannelConfig.update({
    where: { userId },
    data: { defaultProjectId: projectId },
  });
}

/** Desvincula Telegram y desactiva el canal (no borra la user key MCP). */
export async function disconnectChannel(userId: string) {
  await prisma.channelLink.deleteMany({ where: { userId, provider: PROVIDER } });
  const config = await prisma.userChannelConfig.findUnique({ where: { userId } });
  if (config) {
    await prisma.userChannelConfig.update({
      where: { userId },
      data: { enabled: false, llmKeyCiphertext: null, llmKeyLast4: null },
    });
  }
  return { ok: true };
}

export type UpdateClaim = "claimed" | "duplicate" | "rate_limited";

/**
 * Reserva un update entrante antes de procesarlo.
 *
 * Telegram reintenta la entrega cuando el webhook tarda o responde 5xx, y el
 * turno puede ejecutar tools de escritura (publicar informe, crear tarjeta):
 * repetirlo duplica efectos. La unique (provider, updateId) hace de candado, así
 * que el reintento cae en `duplicate` y no vuelve a ejecutar nada. Si el turno
 * se cae a mitad el update queda reservado sin `processedAt` — preferimos perder
 * una respuesta antes que duplicar escrituras.
 *
 * Las filas también son el rate limit: contar en DB funciona en serverless,
 * donde cada request puede caer en otra instancia y un Map de proceso no vale.
 */
export async function claimChannelUpdate(
  updateId: string,
  externalId: string
): Promise<UpdateClaim> {
  try {
    await prisma.channelUpdate.create({
      data: { provider: PROVIDER, updateId, externalId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      return "duplicate";
    throw err;
  }

  const recent = await prisma.channelUpdate.count({
    where: {
      provider: PROVIDER,
      externalId,
      createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) },
    },
  });

  // Poda oportunista: no hay cron, y la tabla no puede crecer sin techo.
  await prisma.channelUpdate
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - UPDATE_RETENTION_MS) } } })
    .catch(() => {});

  return recent > RATE_MAX ? "rate_limited" : "claimed";
}

/** Cierra un update reservado (deja rastro de los turnos que sí terminaron). */
export async function markChannelUpdateProcessed(updateId: string) {
  await prisma.channelUpdate
    .updateMany({
      where: { provider: PROVIDER, updateId, processedAt: null },
      data: { processedAt: new Date() },
    })
    .catch(() => {});
}

/** Carga contexto completo del bot para un telegram user id. */
export async function loadBotSession(telegramUserId: string) {
  const link = await prisma.channelLink.findUnique({
    where: { provider_externalId: { provider: PROVIDER, externalId: telegramUserId } },
  });
  if (!link) return null;

  const config = await prisma.userChannelConfig.findUnique({
    where: { userId: link.userId },
    include: {
      apiKey: true,
      defaultProject: { select: { id: true, name: true, slug: true, workspaceId: true } },
    },
  });
  if (!config || !config.enabled) return null;

  return { link, config };
}
