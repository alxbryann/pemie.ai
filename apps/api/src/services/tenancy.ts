// Servicio de tenencia: workspaces, membresías, invitaciones y proyectos.
// Toda operación se scopea por workspace y verifica el rol del usuario.

import { randomBytes } from "node:crypto";
import type { Role } from "@pemie/shared";
import { prisma } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { uniqueSlug } from "../lib/slug.js";

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

/**
 * Verifica que `userId` es miembro de `workspaceId` con al menos `minRole`.
 * Devuelve la membresía; lanza 403/404 si no aplica.
 */
export async function requireMembership(
  userId: string,
  workspaceId: string,
  minRole: Role = "viewer"
) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) throw notFound("Workspace no encontrado");
  if (ROLE_RANK[membership.role as Role] < ROLE_RANK[minRole])
    throw forbidden("No tienes permiso para esta acción en el workspace");
  return membership;
}

// ─── Workspaces ────────────────────────────────────────────────────────

/** Crea un workspace y hace al creador `owner`. */
export async function createWorkspace(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw badRequest("El nombre es muy corto", "invalid_name");
  const slug = await uniqueSlug(trimmed, async (s) =>
    Boolean(await prisma.workspace.findUnique({ where: { slug: s } }))
  );
  return prisma.workspace.create({
    data: {
      name: trimmed,
      slug,
      memberships: { create: { userId, role: "owner" } },
    },
  });
}

/** Lista los workspaces de un usuario con su rol y conteo de proyectos. */
export async function listWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { workspace: { include: { _count: { select: { projects: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role as Role,
    projectCount: m.workspace._count.projects,
    createdAt: m.workspace.createdAt,
  }));
}

/** Devuelve un workspace por slug si el usuario es miembro, con su rol. */
export async function getWorkspace(userId: string, slug: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) throw notFound("Workspace no encontrado");
  const membership = await requireMembership(userId, workspace.id);
  return { ...workspace, role: membership.role as Role };
}

/** Miembros de un workspace (requiere ser miembro). */
export async function listMembers(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId);
  const memberships = await prisma.membership.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    membershipId: m.id,
    role: m.role as Role,
    user: m.user,
  }));
}

// ─── Invitaciones ──────────────────────────────────────────────────────

/** Crea una invitación (owner/admin). */
export async function createInvitation(
  userId: string,
  workspaceId: string,
  email: string,
  role: Role = "member"
) {
  await requireMembership(userId, workspaceId, "admin");
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw badRequest("Email inválido", "invalid_email");
  if (role === "owner") throw badRequest("No se puede invitar como owner", "invalid_role");

  // Si ya es miembro, no invitar.
  const existingUser = await prisma.user.findUnique({ where: { email: normalized } });
  if (existingUser) {
    const already = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId } },
    });
    if (already) throw conflict("Esa persona ya es miembro", "already_member");
  }

  const token = randomBytes(24).toString("hex");
  return prisma.invitation.create({
    data: {
      workspaceId,
      email: normalized,
      role,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
}

/** Lista invitaciones pendientes (owner/admin). */
export async function listInvitations(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "admin");
  return prisma.invitation.findMany({
    where: { workspaceId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}

/** Revoca una invitación (owner/admin). */
export async function revokeInvitation(userId: string, invitationId: string) {
  const invite = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invite) throw notFound("Invitación no encontrada");
  await requireMembership(userId, invite.workspaceId, "admin");
  return prisma.invitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });
}

/**
 * Acepta una invitación por token: crea la membresía para el usuario actual
 * y marca la invitación como aceptada. El email debe coincidir.
 */
export async function acceptInvitation(userId: string, token: string) {
  const invite = await prisma.invitation.findUnique({ where: { token } });
  if (!invite || invite.status !== "pending") throw notFound("Invitación inválida");
  if (invite.expiresAt.getTime() < Date.now())
    throw badRequest("La invitación expiró", "invite_expired");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");
  if (user.email.toLowerCase() !== invite.email.toLowerCase())
    throw forbidden("Esta invitación es para otro email");

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
  });

  await prisma.$transaction([
    prisma.invitation.update({ where: { id: invite.id }, data: { status: "accepted" } }),
    ...(existing
      ? []
      : [
          prisma.membership.create({
            data: { userId, workspaceId: invite.workspaceId, role: invite.role },
          }),
        ]),
  ]);

  return prisma.workspace.findUnique({ where: { id: invite.workspaceId } });
}

/** Detalle público de una invitación por token (para la pantalla de aceptar). */
export async function getInvitationByToken(token: string) {
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true, slug: true } } },
  });
  if (!invite || invite.status !== "pending") throw notFound("Invitación inválida");
  return {
    email: invite.email,
    role: invite.role as Role,
    workspace: invite.workspace,
    expiresAt: invite.expiresAt,
    expired: invite.expiresAt.getTime() < Date.now(),
  };
}

// ─── Proyectos ─────────────────────────────────────────────────────────

/** Crea un proyecto dentro de un workspace (owner/admin/member). */
export async function createProject(
  userId: string,
  workspaceId: string,
  input: { name: string; description?: string; key?: string }
) {
  await requireMembership(userId, workspaceId, "member");
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("El nombre es muy corto", "invalid_name");
  const slug = await uniqueSlug(name, async (s) =>
    Boolean(await prisma.project.findUnique({ where: { workspaceId_slug: { workspaceId, slug: s } } }))
  );
  const key = (input.key?.trim() || name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, "") || "PRJ";
  return prisma.project.create({
    data: {
      workspaceId,
      name,
      slug,
      description: input.description?.trim() || null,
      key,
    },
  });
}

/** Lista proyectos de un workspace (requiere ser miembro). */
export async function listProjects(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId);
  return prisma.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      key: true,
      createdAt: true,
      _count: { select: { repos: true, userStories: true } },
    },
  });
}

/** Devuelve un proyecto por slug dentro de un workspace-slug (requiere membresía). */
export async function getProject(userId: string, workspaceSlug: string, projectSlug: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw notFound("Workspace no encontrado");
  await requireMembership(userId, workspace.id);
  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: projectSlug } },
  });
  if (!project) throw notFound("Proyecto no encontrado");
  return { ...project, workspace: { name: workspace.name, slug: workspace.slug } };
}
