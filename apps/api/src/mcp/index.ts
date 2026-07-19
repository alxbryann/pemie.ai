// Interfaz MCP (F4) — consumida por agentes. Es una capa delgada de JSON-RPC
// 2.0 sobre HTTP (el protocolo MCP) encima de la MISMA capa de servicios que
// usa el REST. No contiene lógica de negocio: autentica la API key (Bearer),
// exige el scope de cada tool, delega en las operaciones `opXxx` (ya acotadas
// al proyecto de la key) y registra cada llamada en el AuditLog.

import type { Hono } from "hono";
import type { ApiKey } from "@prisma/client";
import type { ApiScope } from "@pemie/shared";
import type { AppEnv } from "../rest/http.js";
import { ServiceError, forbidden } from "../services/errors.js";
import * as agents from "../services/agents.js";
import * as ingest from "../services/ingest.js";
import * as stats from "../services/stats.js";
import * as reports from "../services/reports.js";
import * as stories from "../services/stories.js";
import * as board from "../services/board.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "pemie.ai", version: "0.1.0" };

interface McpContext {
  key: ApiKey;
  projectId: string | null;
}

/** Exige que la API key esté vinculada a un proyecto. */
function requireProject(ctx: McpContext): string {
  if (!ctx.projectId)
    throw forbidden("Esta API key no está vinculada a un proyecto; créala con un projectId");
  return ctx.projectId;
}

// ─── Registro de tools ─────────────────────────────────────────────────────

interface McpTool {
  name: string;
  description: string;
  scope: ApiScope;
  inputSchema: Record<string, unknown>;
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<unknown>;
}

const OBJECT_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

const TOOLS: McpTool[] = [
  {
    name: "get_project_context",
    description: "Objetivo actual, stats de commits y último informe del proyecto.",
    scope: "commits:read",
    inputSchema: OBJECT_SCHEMA,
    handler: async (ctx) => {
      const projectId = requireProject(ctx);
      const [objective, projectStats, latest] = await Promise.all([
        reports.opGetObjective(projectId),
        stats.opProjectStats(projectId),
        reports.opListReports(projectId, { limit: 1 }),
      ]);
      return { objective, stats: projectStats, latestReport: latest[0] ?? null };
    },
  },
  {
    name: "list_commits",
    description: "Lista commits del proyecto (filtrable por dominio o contribuidor).",
    scope: "commits:read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        domain: { type: "string" },
        contributorId: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      ingest.opListCommits(requireProject(ctx), {
        limit: typeof args.limit === "number" ? args.limit : undefined,
        domain: typeof args.domain === "string" ? args.domain : undefined,
        contributorId: typeof args.contributorId === "string" ? args.contributorId : undefined,
      }),
  },
  {
    name: "get_evaluation",
    description: "Últimos informes de avance del proyecto.",
    scope: "reports:read",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      reports.opListReports(requireProject(ctx), {
        limit: typeof args.limit === "number" ? args.limit : 10,
      }),
  },
  {
    name: "publish_report",
    description: "Publica (o actualiza) un informe de avance. Idempotente por fecha+slot.",
    scope: "reports:write",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD para scope 'day'" },
        slot: { type: "string" },
        scope: { type: "string", enum: ["day", "general"] },
        comment: { type: "string" },
        verdict: { type: "string" },
        score: { type: "number" },
      },
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      reports.opPublishReport(requireProject(ctx), {
        date: args.date as string | undefined,
        slot: args.slot as string | undefined,
        scope: args.scope as "day" | "general" | undefined,
        comment: args.comment as string | undefined,
        verdict: args.verdict as string | undefined,
        score: typeof args.score === "number" ? args.score : undefined,
        agentId: ctx.key.agentId ?? undefined,
      }),
  },
  {
    name: "list_notes",
    description: "Lista notas/feedback del proyecto (filtrable por estado).",
    scope: "notes:read",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["pending", "processed"] } },
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      reports.opListNotes(requireProject(ctx), {
        status: args.status === "pending" || args.status === "processed" ? args.status : undefined,
      }),
  },
  {
    name: "answer_note",
    description: "Responde una nota y opcionalmente la asocia a un informe.",
    scope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        noteId: { type: "string" },
        response: { type: "string" },
        reportId: { type: "string" },
      },
      required: ["noteId", "response"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => {
      const projectId = requireProject(ctx);
      const note = await reports.getNoteById(String(args.noteId));
      if (!note || note.projectId !== projectId) throw forbidden("La nota no pertenece a este proyecto");
      return reports.opAnswerNote(note, String(args.response), args.reportId as string | undefined);
    },
  },
  {
    name: "get_objective",
    description: "Objetivo actual del proyecto.",
    scope: "objective:read",
    inputSchema: OBJECT_SCHEMA,
    handler: (ctx) => reports.opGetObjective(requireProject(ctx)),
  },
  {
    name: "update_objective",
    description: "Fija o actualiza el objetivo del proyecto (guarda historial).",
    scope: "objective:write",
    inputSchema: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      reports.opSetObjective(requireProject(ctx), String(args.description), null),
  },
  {
    name: "list_user_stories",
    description: "Lista las Historias de Usuario del proyecto (filtrable por estado/épica).",
    scope: "stories:read",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" }, epicId: { type: "string" } },
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      stories.opListStories(requireProject(ctx), {
        status: args.status as string | undefined,
        epicId: args.epicId as string | undefined,
      }),
  },
  {
    name: "create_user_story",
    description: "Crea una Historia de Usuario (narrativa role/want/benefit + criterios).",
    scope: "stories:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        narrative: {
          type: "object",
          properties: { role: { type: "string" }, want: { type: "string" }, benefit: { type: "string" } },
        },
        acceptanceCriteria: {
          type: "array",
          items: {
            type: "object",
            properties: { given: { type: "string" }, when: { type: "string" }, then: { type: "string" } },
          },
        },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        storyPoints: { type: "number" },
        epicId: { type: "string" },
        status: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      stories.opCreateStory(
        requireProject(ctx),
        {
          title: String(args.title),
          narrative: args.narrative as never,
          acceptanceCriteria: args.acceptanceCriteria as never,
          priority: args.priority as string | undefined,
          storyPoints: typeof args.storyPoints === "number" ? args.storyPoints : undefined,
          epicId: args.epicId as string | undefined,
          status: args.status as string | undefined,
        },
        { createdByAgentId: ctx.key.agentId ?? undefined }
      ),
  },
  {
    name: "update_user_story",
    description: "Actualiza una Historia de Usuario (título, estado, prioridad, narrativa…).",
    scope: "stories:write",
    inputSchema: {
      type: "object",
      properties: {
        storyId: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        storyPoints: { type: "number" },
      },
      required: ["storyId"],
      additionalProperties: true,
    },
    handler: async (ctx, args) => {
      const projectId = requireProject(ctx);
      const story = await stories.getStoryById(String(args.storyId));
      if (!story || story.projectId !== projectId) throw forbidden("La HU no pertenece a este proyecto");
      return stories.opUpdateStory(story, {
        title: args.title as string | undefined,
        status: args.status as string | undefined,
        priority: args.priority as string | undefined,
        storyPoints: typeof args.storyPoints === "number" ? args.storyPoints : undefined,
        narrative: args.narrative as never,
        acceptanceCriteria: args.acceptanceCriteria as never,
        epicId: args.epicId as string | null | undefined,
      });
    },
  },
  {
    name: "list_board",
    description: "Devuelve el tablero Kanban con columnas y tarjetas.",
    scope: "board:read",
    inputSchema: OBJECT_SCHEMA,
    handler: (ctx) => board.opListBoard(requireProject(ctx)),
  },
  {
    name: "create_card",
    description: "Crea una tarjeta en el tablero (opcionalmente ligada a una HU).",
    scope: "board:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: { type: "string", enum: ["story", "task", "bug"] },
        description: { type: "string" },
        columnId: { type: "string" },
        userStoryId: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: (ctx, args) =>
      board.opCreateCard(
        requireProject(ctx),
        {
          title: String(args.title),
          type: args.type as string | undefined,
          description: args.description as string | undefined,
          columnId: args.columnId as string | undefined,
          userStoryId: args.userStoryId as string | undefined,
        },
        { actorType: "agent", actorId: ctx.key.agentId ?? ctx.key.id }
      ),
  },
  {
    name: "move_card",
    description: "Mueve una tarjeta a otra columna del tablero.",
    scope: "board:write",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string" },
        columnId: { type: "string" },
        order: { type: "number" },
      },
      required: ["cardId", "columnId"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => {
      const projectId = requireProject(ctx);
      const card = await board.getCardWithProject(String(args.cardId));
      if (!card || card.board.projectId !== projectId)
        throw forbidden("La tarjeta no pertenece a este proyecto");
      return board.opMoveCard(
        card,
        { columnId: String(args.columnId), order: typeof args.order === "number" ? args.order : undefined },
        { actorType: "agent", actorId: ctx.key.agentId ?? ctx.key.id }
      );
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ─── Registro de resources ─────────────────────────────────────────────────

interface McpResource {
  uri: string;
  name: string;
  description: string;
  scope: ApiScope;
  read: (ctx: McpContext) => Promise<unknown>;
}

const RESOURCES: McpResource[] = [
  {
    uri: "pemie://project/context",
    name: "project_context",
    description: "Objetivo, stats y último informe.",
    scope: "commits:read",
    read: (ctx) => TOOL_BY_NAME.get("get_project_context")!.handler(ctx, {}),
  },
  {
    uri: "pemie://project/commits",
    name: "commits",
    description: "Commits del proyecto.",
    scope: "commits:read",
    read: (ctx) => ingest.opListCommits(requireProject(ctx), {}),
  },
  {
    uri: "pemie://project/reports",
    name: "reports",
    description: "Informes de avance.",
    scope: "reports:read",
    read: (ctx) => reports.opListReports(requireProject(ctx), {}),
  },
  {
    uri: "pemie://project/notes",
    name: "notes",
    description: "Notas/feedback.",
    scope: "notes:read",
    read: (ctx) => reports.opListNotes(requireProject(ctx), {}),
  },
];

const RESOURCE_BY_URI = new Map(RESOURCES.map((r) => [r.uri, r]));

// ─── JSON-RPC ────────────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function asText(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

interface RpcRequest {
  jsonrpc: string;
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

/** Procesa una petición JSON-RPC. Devuelve undefined para notificaciones. */
async function handleRpc(ctx: McpContext, req: RpcRequest): Promise<object | undefined> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return undefined; // notificación: sin respuesta

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) return rpcError(id, -32602, `Tool desconocida: ${name}`);
      agents.requireScope(ctx.key, tool.scope);
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = await tool.handler(ctx, args);
        await auditToolCall(ctx, name, args);
        return rpcResult(id, asText(result));
      } catch (err) {
        // Errores de negocio se devuelven como resultado isError (convención MCP).
        if (err instanceof ServiceError)
          return rpcResult(id, { ...asText({ error: err.message, code: err.code }), isError: true });
        throw err;
      }
    }

    case "resources/list":
      return rpcResult(id, {
        resources: RESOURCES.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: "application/json",
        })),
      });

    case "resources/read": {
      const uri = String(req.params?.uri ?? "");
      const resource = RESOURCE_BY_URI.get(uri);
      if (!resource) return rpcError(id, -32602, `Resource desconocido: ${uri}`);
      agents.requireScope(ctx.key, resource.scope);
      const data = await resource.read(ctx);
      return rpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
      });
    }

    default:
      return isNotification ? undefined : rpcError(id, -32601, `Método no soportado: ${req.method}`);
  }
}

/** Envuelve handleRpc: convierte ServiceError (auth/scope) en error JSON-RPC. */
async function safeHandle(ctx: McpContext, req: RpcRequest): Promise<object | undefined> {
  try {
    return await handleRpc(ctx, req);
  } catch (err) {
    if (err instanceof ServiceError) return rpcError(req.id ?? null, -32000, err.message);
    throw err;
  }
}

function auditToolCall(ctx: McpContext, name: string, args: Record<string, unknown>) {
  return agents.audit({
    workspaceId: ctx.key.workspaceId,
    actorType: "agent",
    actorId: ctx.key.agentId ?? ctx.key.id,
    action: `mcp.${name}`,
    entity: "Project",
    entityId: ctx.projectId ?? undefined,
    meta: { args },
  });
}

/**
 * Monta la interfaz MCP. `GET /mcp` es un descriptor público; `POST /mcp` es el
 * endpoint JSON-RPC autenticado por API key (`Authorization: Bearer <key>`).
 */
export function registerMcp(app: Hono<AppEnv>) {
  app.get("/mcp", (c) =>
    c.json({
      name: SERVER_INFO.name,
      protocol: "mcp/json-rpc",
      protocolVersion: PROTOCOL_VERSION,
      transport: "POST /mcp (Authorization: Bearer <api-key>)",
      tools: TOOLS.map((t) => ({ name: t.name, scope: t.scope })),
      resources: RESOURCES.map((r) => ({ uri: r.uri, scope: r.scope })),
    })
  );

  app.post("/mcp", async (c) => {
    const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    let key: ApiKey;
    try {
      key = await agents.authenticateApiKey(bearer);
    } catch (err) {
      const msg = err instanceof ServiceError ? err.message : "No autorizado";
      return c.json(rpcError(null, -32001, msg), 401);
    }

    const body = (await c.req.json().catch(() => null)) as RpcRequest | RpcRequest[] | null;
    if (!body) return c.json(rpcError(null, -32700, "Parse error"), 400);
    const ctx: McpContext = { key, projectId: key.projectId };

    // Batch (array) o petición única.
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((r) => safeHandle(ctx, r)));
      return c.json(results.filter((r): r is object => r !== undefined));
    }
    if (body.jsonrpc !== "2.0" || typeof body.method !== "string")
      return c.json(rpcError(body.id ?? null, -32600, "Invalid Request"), 400);

    const res = await safeHandle(ctx, body);
    if (res === undefined) return c.body(null, 204); // notificación
    return c.json(res);
  });
}
