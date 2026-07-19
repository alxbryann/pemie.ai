import type { Hono } from "hono";
import { prisma } from "../db.js";
import { type AppEnv, sessionMiddleware } from "./http.js";
import { authRoutes } from "./auth.js";
import { workspaceRoutes } from "./workspaces.js";
import { invitationRoutes } from "./invitations.js";

/**
 * Monta la interfaz REST/JSON (consumida por el frontend web) sobre `app`.
 * Cada handler debe delegar en la capa de servicios (src/services); aquí solo
 * va traducción HTTP <-> servicios. Los recursos se agregan por fase.
 */
export function registerRest(app: Hono<AppEnv>) {
  app.get("/api/health", async (c) => {
    let db = "unknown";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "down";
    }
    return c.json({
      status: "ok",
      service: "pemie-api",
      db,
      timestamp: new Date().toISOString(),
    });
  });

  // Índice de la API.
  app.get("/api", (c) =>
    c.json({
      name: "pemie.ai API",
      version: "0.1.0",
      interfaces: {
        rest: "/api/**  (frontend web)",
        mcp: "/mcp      (agentes, API key + scopes)",
        webhooks: "/webhooks/github (ingesta)",
      },
    })
  );

  // Resuelve la sesión (cookie -> user) para todo /api/*.
  app.use("/api/*", sessionMiddleware);

  // Recursos F1: auth + tenencia.
  app.route("/api/auth", authRoutes());
  app.route("/api/workspaces", workspaceRoutes());
  app.route("/api/invitations", invitationRoutes());
}
