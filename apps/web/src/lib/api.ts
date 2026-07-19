// Cliente HTTP del backend pemie-api. El frontend es puro cliente: toda la
// lógica de negocio vive en el backend. Aquí solo hay transporte + tipos.

import type { Role } from "@pemie/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data?.code);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ─── Tipos ───────────────────────────────────────────────────────────

export interface Health {
  status: string;
  service: string;
  db: string;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
  projectCount: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  membershipId: string;
  role: Role;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationDetail {
  email: string;
  role: Role;
  workspace: { name: string; slug: string };
  expiresAt: string;
  expired: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  key: string;
  createdAt: string;
  _count: { repos: number; userStories: number };
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  key: string;
  createdAt: string;
  updatedAt: string;
  workspace: { name: string; slug: string };
}

// ─── API ─────────────────────────────────────────────────────────────

export const api = {
  health: () => get<Health>("/api/health"),

  auth: {
    me: () => get<{ user: User | null }>("/api/auth/me"),
    register: (input: { email: string; password: string; name?: string }) =>
      post<{ user: User }>("/api/auth/register", input),
    login: (input: { email: string; password: string }) =>
      post<{ user: User }>("/api/auth/login", input),
    logout: () => post<{ ok: true }>("/api/auth/logout"),
    githubUrl: () => `${API_URL}/api/auth/github`,
  },

  workspaces: {
    list: () => get<{ workspaces: WorkspaceSummary[] }>("/api/workspaces"),
    create: (name: string) => post<{ workspace: Workspace }>("/api/workspaces", { name }),
    get: (slug: string) => get<{ workspace: Workspace }>(`/api/workspaces/${slug}`),
    members: (slug: string) => get<{ members: Member[] }>(`/api/workspaces/${slug}/members`),
    invitations: (slug: string) =>
      get<{ invitations: Invitation[] }>(`/api/workspaces/${slug}/invitations`),
    invite: (slug: string, email: string, role?: Role) =>
      post<{ invitation: Invitation }>(`/api/workspaces/${slug}/invitations`, { email, role }),
    revokeInvite: (slug: string, id: string) =>
      del<{ ok: true }>(`/api/workspaces/${slug}/invitations/${id}`),
  },

  projects: {
    list: (wsSlug: string) =>
      get<{ projects: ProjectSummary[] }>(`/api/workspaces/${wsSlug}/projects`),
    create: (wsSlug: string, input: { name: string; description?: string; key?: string }) =>
      post<{ project: Project }>(`/api/workspaces/${wsSlug}/projects`, input),
    get: (wsSlug: string, projectSlug: string) =>
      get<{ project: Project }>(`/api/workspaces/${wsSlug}/projects/${projectSlug}`),
  },

  invitations: {
    detail: (token: string) =>
      get<{ invitation: InvitationDetail }>(`/api/invitations/${token}`),
    accept: (token: string) =>
      post<{ workspace: Workspace }>(`/api/invitations/${token}/accept`),
  },
};
