import type { Hono } from "hono";
import type { AppEnv } from "../rest/http.js";

/**
 * Monta la interfaz MCP (consumida por agentes) sobre `app`.
 *
 * NO es un backend aparte: es una interfaz delgada sobre la misma capa de
 * servicios (src/services) que usa el REST. La implementación real de tools y
 * resources llega en F4 con `@modelcontextprotocol/sdk` (transport HTTP/SSE),
 * autenticando por API key de proyecto + scopes y registrando cada acción en
 * el AuditLog.
 *
 * Placeholder de F0: expone un descriptor de las tools/resources previstas.
 */
export function registerMcp(app: Hono<AppEnv>) {
  app.get("/mcp", (c) =>
    c.json({
      status: "not-implemented",
      note: "Interfaz MCP disponible desde F4.",
      planned: {
        resources: [
          "project_context",
          "commits",
          "contributors",
          "reports",
          "notes",
          "board",
          "user_stories",
        ],
        tools: [
          "get_project_context",
          "list_commits",
          "get_evaluation",
          "publish_report",
          "answer_note",
          "create_user_story",
          "update_user_story",
          "list_board",
          "create_card",
          "move_card",
          "update_objective",
        ],
      },
    })
  );
}
