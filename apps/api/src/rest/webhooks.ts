// Webhooks entrantes de GitHub (F2). Fuera de /api/* a propósito: no llevan
// sesión de usuario; se autentican por la firma HMAC del secreto de la App.

import { Hono } from "hono";
import { verifyWebhookSignature } from "../lib/github-app.js";
import * as ingest from "../services/ingest.js";
import type { AppEnv } from "./http.js";

export function webhookRoutes() {
  const app = new Hono<AppEnv>();

  app.post("/github", async (c) => {
    // La firma se calcula sobre el cuerpo crudo: hay que leerlo como texto.
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
    // installation / installation_repositories / etc.: se aceptan sin procesar.
    return c.json({ ok: true, ignored: event });
  });

  return app;
}
