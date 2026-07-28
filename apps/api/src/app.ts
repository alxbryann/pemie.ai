// Construcción de la app Hono: un solo núcleo de negocio (services/) expuesto
// por REST y MCP. Este módulo NO escucha en un puerto — así el mismo grafo de
// rutas se usa tanto por el servidor Node local (index.ts) como por la función
// serverless de Vercel (api/server.ts).

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { allowedOrigins, isProd } from "./env.js";
import { registerRest } from "./rest/index.js";
import { mcpRoutes } from "./mcp/index.js";
import type { AppEnv } from "./rest/http.js";
import { ServiceError } from "./services/errors.js";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", logger());
  app.use("*", cors({ origin: resolveCorsOrigin, credentials: true }));

  // Interfaz REST (frontend web) e interfaz MCP (agentes), ambas sobre la
  // misma capa de servicios.
  registerRest(app);

  // MCP se monta dos veces a propósito: `/mcp` es la URL pública que consume el
  // agente, y `/api/mcp` es donde aterriza en Vercel (las funciones viven bajo
  // /api y el rewrite de `/mcp` reescribe la ruta).
  const mcp = mcpRoutes();
  app.route("/mcp", mcp);
  app.route("/api/mcp", mcp);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // Traduce errores de la capa de servicios a respuestas HTTP.
  app.onError((err, c) => {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    console.error("Unhandled error:", err);
    return c.json({ error: "Error interno" }, 500);
  });

  return app;
}

/**
 * Allowlist de CORS. En producción el front se sirve del mismo origen que el
 * API (deploy monolítico en Vercel), así que CORS casi no interviene; importa
 * en dev (Vite en otro puerto) y para orígenes extra declarados en WEB_ORIGINS.
 */
function resolveCorsOrigin(origin: string): string | null {
  if (allowedOrigins.includes(origin)) return origin;
  // En dev, cualquier localhost: Vite cambia de puerto si el 5173 está ocupado.
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export const app = createApp();
