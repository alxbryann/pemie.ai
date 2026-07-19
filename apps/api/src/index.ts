import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { registerRest } from "./rest/index.js";
import { registerMcp } from "./mcp/index.js";
import type { AppEnv } from "./rest/http.js";
import { ServiceError } from "./services/errors.js";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  })
);

// Interfaz REST (frontend web) e interfaz MCP (agentes), ambas sobre la
// misma capa de servicios.
registerRest(app);
registerMcp(app);

app.notFound((c) => c.json({ error: "Not found" }, 404));

// Traduce errores de la capa de servicios a respuestas HTTP.
app.onError((err, c) => {
  if (err instanceof ServiceError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Error interno" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 pemie-api en http://localhost:${info.port}`);
});
