// Rutas REST de workspaces, membresías, invitaciones y proyectos.
// Delegan en src/services/tenancy. Todas requieren usuario autenticado.

import { Hono } from "hono";
import { z } from "zod";
import * as tenancy from "../services/tenancy.js";
import { badRequest } from "../services/errors.js";
import { type AppEnv, requireUser } from "./http.js";

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

  return app;
}
