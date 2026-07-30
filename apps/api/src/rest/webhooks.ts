// Webhooks entrantes (GitHub + Telegram). Fuera de sesión de usuario.

import { Hono } from "hono";
import { verifyWebhookSignature } from "../lib/github-app.js";
import * as ingest from "../services/ingest.js";
import * as telegramBot from "../services/telegram-bot.js";
import type { AppEnv } from "./http.js";

export function webhookRoutes() {
  const app = new Hono<AppEnv>();

  app.post("/github", async (c) => {
    const raw = await c.req.text();
    const signature = c.req.header("x-hub-signature-256");
    if (!verifyWebhookSignature(raw, signature)) {
      return c.json({ error: "firma inválida" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ error: "payload inválido" }, 400);
    }

    const event = c.req.header("x-github-event") ?? "";
    if (event === "ping") return c.json({ ok: true, pong: true });
    if (event === "push") {
      const result = await ingest.ingestPushEvent(payload as ingest.PushEvent);
      return c.json({ ok: true, ...result });
    }
    return c.json({ ok: true, ignored: event });
  });

  app.post("/telegram", async (c) => {
    if (!telegramBot.isTelegramConfigured()) {
      return c.json({ error: "Telegram no configurado" }, 503);
    }
    const secret = c.req.header("x-telegram-bot-api-secret-token");
    if (!telegramBot.verifyTelegramSecret(secret)) {
      return c.json({ error: "secret inválido" }, 401);
    }

    const update = await c.req.json().catch(() => null);
    if (!update) return c.json({ error: "payload inválido" }, 400);

    // El turno se procesa en la misma request: en serverless no hay proceso vivo
    // después de responder. El handler acota el turno por debajo del maxDuration
    // y deduplica por update_id, así que un reintento de Telegram no repite nada.
    const result = await telegramBot.handleTelegramUpdate(update);
    return c.json(result);
  });

  return app;
}
