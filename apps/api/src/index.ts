import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { registerRest } from "./rest/index.js";
import { registerMcp } from "./mcp/index.js";

const app = new Hono();

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

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 pemie-api en http://localhost:${info.port}`);
});
