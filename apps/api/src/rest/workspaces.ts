// Rutas REST de workspaces, membresías, invitaciones y proyectos.
// Delegan en src/services/tenancy. Todas requieren usuario autenticado.

import { Hono } from "hono";
import { z } from "zod";
import * as tenancy from "../services/tenancy.js";
import * as ingest from "../services/ingest.js";
import * as stats from "../services/stats.js";
import * as reports from "../services/reports.js";
import * as agentsSvc from "../services/agents.js";
import * as stories from "../services/stories.js";
import * as board from "../services/board.js";
import { badRequest } from "../services/errors.js";
import { listInstallationRepos } from "../lib/github-app.js";
import { type AppContext, type AppEnv, requireUser } from "./http.js";

const createWorkspaceSchema = z.object({ name: z.string().min(2) });
const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  key: z.string().optional(),
});
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).optional(),
});
const linkRepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  externalId: z.string().optional(),
  installationId: z.string().optional(),
});
const objectiveSchema = z.object({ description: z.string().min(3) });
const publishReportSchema = z.object({
  date: z.string().optional(),
  slot: z.string().optional(),
  scope: z.enum(["day", "general"]).optional(),
  comment: z.string().optional(),
  verdict: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  metrics: z.unknown().optional(),
});
const createNoteSchema = z.object({ message: z.string().min(1) });
const answerNoteSchema = z.object({
  response: z.string().min(1),
  reportId: z.string().optional(),
});
const createAgentSchema = z.object({
  name: z.string().min(2),
  kind: z.string().optional(),
});
const createApiKeySchema = z.object({
  name: z.string().min(2),
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.coerce.date().optional(),
});
const createEpicSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
});
const narrativeSchema = z.object({
  role: z.string(),
  want: z.string(),
  benefit: z.string(),
});
const acceptanceCriterionSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
const createStorySchema = z.object({
  title: z.string().min(2),
  narrative: narrativeSchema.optional(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  storyPoints: z.number().int().optional(),
  epicId: z.string().optional(),
  status: z.string().optional(),
});
const updateStorySchema = z.object({
  title: z.string().min(2).optional(),
  narrative: narrativeSchema.optional(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  storyPoints: z.number().int().nullable().optional(),
  status: z.string().optional(),
  epicId: z.string().nullable().optional(),
});
const createCardSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["story", "task", "bug"]).optional(),
  description: z.string().optional(),
  columnId: z.string().optional(),
  userStoryId: z.string().optional(),
  assigneeId: z.string().optional(),
  labels: z.unknown().optional(),
});
const updateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["story", "task", "bug"]).optional(),
  assigneeId: z.string().nullable().optional(),
  labels: z.unknown().optional(),
});
const moveCardSchema = z.object({
  columnId: z.string().min(1),
  order: z.number().optional(),
});

export function workspaceRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const user = requireUser(c);
    return c.json({ workspaces: await tenancy.listWorkspaces(user.id) });
  });

  app.post("/", async (c) => {
    const user = requireUser(c);
    const body = createWorkspaceSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Nombre inválido", "invalid_body");
    const ws = await tenancy.createWorkspace(user.id, body.data.name);
    return c.json({ workspace: ws }, 201);
  });

  app.get("/:slug", async (c) => {
    const user = requireUser(c);
    return c.json({ workspace: await tenancy.getWorkspace(user.id, c.req.param("slug")) });
  });

  app.get("/:slug/members", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    return c.json({ members: await tenancy.listMembers(user.id, ws.id) });
  });

  // ─── Invitaciones (owner/admin) ────────────────────────────────────
  app.get("/:slug/invitations", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    return c.json({ invitations: await tenancy.listInvitations(user.id, ws.id) });
  });

  app.post("/:slug/invitations", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    const body = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de invitación inválidos", "invalid_body");
    const invite = await tenancy.createInvitation(
      user.id,
      ws.id,
      body.data.email,
      body.data.role ?? "member"
    );
    return c.json({ invitation: invite }, 201);
  });

  app.delete("/:slug/invitations/:id", async (c) => {
    const user = requireUser(c);
    await tenancy.revokeInvitation(user.id, c.req.param("id"));
    return c.json({ ok: true });
  });

  // ─── Proyectos ─────────────────────────────────────────────────────
  app.get("/:slug/projects", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    return c.json({ projects: await tenancy.listProjects(user.id, ws.id) });
  });

  app.post("/:slug/projects", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    const body = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de proyecto inválidos", "invalid_body");
    const project = await tenancy.createProject(user.id, ws.id, body.data);
    return c.json({ project }, 201);
  });

  app.get("/:slug/projects/:projectSlug", async (c) => {
    const user = requireUser(c);
    const project = await tenancy.getProject(
      user.id,
      c.req.param("slug"),
      c.req.param("projectSlug")
    );
    return c.json({ project });
  });

  // ─── F2: Ingesta (repos / commits / stats) ─────────────────────────
  // `resolveProject` valida membresía (viewer) y que el proyecto pertenezca al
  // workspace; los servicios de ingesta re-verifican el rol requerido.
  const resolveProject = (c: AppContext) =>
    tenancy.getProject(requireUser(c).id, c.req.param("slug")!, c.req.param("projectSlug")!);

  app.get("/:slug/projects/:projectSlug/repos", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ repos: await ingest.listRepos(user.id, project.id) });
  });

  app.post("/:slug/projects/:projectSlug/repos", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = linkRepoSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos del repo inválidos", "invalid_body");
    const repo = await ingest.linkRepo(user.id, project.id, body.data);
    return c.json({ repo }, 201);
  });

  // Repos disponibles vía una instalación de la GitHub App (para elegir cuál vincular).
  app.get("/:slug/projects/:projectSlug/github/repos", async (c) => {
    await resolveProject(c);
    const installationId = c.req.query("installationId");
    if (!installationId) throw badRequest("Falta installationId", "missing_installation");
    return c.json({ repos: await listInstallationRepos(installationId) });
  });

  app.delete("/:slug/projects/:projectSlug/repos/:repoId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    return c.json(await ingest.unlinkRepo(user.id, c.req.param("repoId")));
  });

  app.post("/:slug/projects/:projectSlug/repos/:repoId/backfill", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    return c.json(await ingest.backfillRepo(user.id, c.req.param("repoId")));
  });

  app.get("/:slug/projects/:projectSlug/commits", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const limit = Number(c.req.query("limit")) || undefined;
    const commits = await ingest.listCommits(user.id, project.id, {
      limit,
      domain: c.req.query("domain"),
      contributorId: c.req.query("contributorId"),
    });
    return c.json({ commits });
  });

  app.get("/:slug/projects/:projectSlug/stats", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ stats: await stats.projectStats(user.id, project.id) });
  });

  // ─── F3: Objetivo, informes y notas (flujo Hermes generalizado) ────
  app.get("/:slug/projects/:projectSlug/objective", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ objective: await reports.getObjective(user.id, project.id) });
  });

  app.put("/:slug/projects/:projectSlug/objective", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = objectiveSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Objetivo inválido", "invalid_body");
    return c.json({ objective: await reports.setObjective(user.id, project.id, body.data.description) });
  });

  app.get("/:slug/projects/:projectSlug/objective/history", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ history: await reports.listObjectiveHistory(user.id, project.id) });
  });

  app.get("/:slug/projects/:projectSlug/reports", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const scope = c.req.query("scope");
    return c.json({
      reports: await reports.listReports(user.id, project.id, {
        scope: scope === "day" || scope === "general" ? scope : undefined,
        limit: Number(c.req.query("limit")) || undefined,
      }),
    });
  });

  app.post("/:slug/projects/:projectSlug/reports", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = publishReportSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos del informe inválidos", "invalid_body");
    const report = await reports.publishReport(user.id, project.id, body.data);
    return c.json({ report }, 201);
  });

  app.get("/:slug/projects/:projectSlug/reports/:reportId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    return c.json({ report: await reports.getReport(user.id, c.req.param("reportId")) });
  });

  app.delete("/:slug/projects/:projectSlug/reports/:reportId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    return c.json(await reports.deleteReport(user.id, c.req.param("reportId")));
  });

  app.get("/:slug/projects/:projectSlug/notes", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const status = c.req.query("status");
    return c.json({
      notes: await reports.listNotes(user.id, project.id, {
        status: status === "pending" || status === "processed" ? status : undefined,
        limit: Number(c.req.query("limit")) || undefined,
      }),
    });
  });

  app.post("/:slug/projects/:projectSlug/notes", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = createNoteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Nota inválida", "invalid_body");
    return c.json({ note: await reports.createNote(user.id, project.id, body.data.message) }, 201);
  });

  app.post("/:slug/projects/:projectSlug/notes/:noteId/answer", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    const body = answerNoteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Respuesta inválida", "invalid_body");
    const note = await reports.answerNote(user.id, c.req.param("noteId"), body.data.response, body.data.reportId);
    return c.json({ note });
  });

  // ─── F4: Agentes (por proyecto) ────────────────────────────────────
  app.get("/:slug/projects/:projectSlug/agents", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ agents: await agentsSvc.listAgents(user.id, project.id) });
  });

  app.post("/:slug/projects/:projectSlug/agents", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = createAgentSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos del agente inválidos", "invalid_body");
    const agent = await agentsSvc.createAgent(user.id, project.id, body.data.name, body.data.kind);
    return c.json({ agent }, 201);
  });

  // ─── F4: API keys y AuditLog (por workspace, admin+) ───────────────
  app.get("/:slug/api-keys", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    return c.json({ apiKeys: await agentsSvc.listApiKeys(user.id, ws.id) });
  });

  app.post("/:slug/api-keys", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    const body = createApiKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la API key inválidos", "invalid_body");
    // El servicio valida que los scopes existan; aquí solo pasamos los datos.
    const result = await agentsSvc.createApiKey(user.id, ws.id, {
      name: body.data.name,
      projectId: body.data.projectId,
      agentId: body.data.agentId,
      scopes: body.data.scopes,
      expiresAt: body.data.expiresAt,
    });
    return c.json(result, 201);
  });

  app.delete("/:slug/api-keys/:keyId", async (c) => {
    const user = requireUser(c);
    await tenancy.getWorkspace(user.id, c.req.param("slug"));
    return c.json(await agentsSvc.revokeApiKey(user.id, c.req.param("keyId")));
  });

  app.get("/:slug/audit", async (c) => {
    const user = requireUser(c);
    const ws = await tenancy.getWorkspace(user.id, c.req.param("slug"));
    const limit = Number(c.req.query("limit")) || undefined;
    return c.json({ auditLogs: await agentsSvc.listAuditLogs(user.id, ws.id, limit) });
  });

  // ─── F5: Épicas e Historias de Usuario ─────────────────────────────
  app.get("/:slug/projects/:projectSlug/epics", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ epics: await stories.listEpics(user.id, project.id) });
  });

  app.post("/:slug/projects/:projectSlug/epics", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = createEpicSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la épica inválidos", "invalid_body");
    return c.json({ epic: await stories.createEpic(user.id, project.id, body.data) }, 201);
  });

  app.get("/:slug/projects/:projectSlug/user-stories", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({
      userStories: await stories.listStories(user.id, project.id, {
        status: c.req.query("status"),
        epicId: c.req.query("epicId"),
      }),
    });
  });

  app.post("/:slug/projects/:projectSlug/user-stories", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = createStorySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la HU inválidos", "invalid_body");
    return c.json({ userStory: await stories.createStory(user.id, project.id, body.data) }, 201);
  });

  app.get("/:slug/projects/:projectSlug/user-stories/:storyId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    return c.json({ userStory: await stories.getStory(user.id, c.req.param("storyId")) });
  });

  app.patch("/:slug/projects/:projectSlug/user-stories/:storyId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    const body = updateStorySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la HU inválidos", "invalid_body");
    return c.json({ userStory: await stories.updateStory(user.id, c.req.param("storyId"), body.data) });
  });

  // ─── F6: Kanban ────────────────────────────────────────────────────
  app.get("/:slug/projects/:projectSlug/board", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    return c.json({ board: await board.getBoard(user.id, project.id) });
  });

  app.post("/:slug/projects/:projectSlug/board/cards", async (c) => {
    const user = requireUser(c);
    const project = await resolveProject(c);
    const body = createCardSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la tarjeta inválidos", "invalid_body");
    return c.json({ card: await board.createCard(user.id, project.id, body.data) }, 201);
  });

  app.patch("/:slug/projects/:projectSlug/board/cards/:cardId", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    const body = updateCardSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de la tarjeta inválidos", "invalid_body");
    return c.json({ card: await board.updateCard(user.id, c.req.param("cardId"), body.data) });
  });

  app.post("/:slug/projects/:projectSlug/board/cards/:cardId/move", async (c) => {
    const user = requireUser(c);
    await resolveProject(c);
    const body = moveCardSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de movimiento inválidos", "invalid_body");
    return c.json({ card: await board.moveCard(user.id, c.req.param("cardId"), body.data) });
  });

  return app;
}
