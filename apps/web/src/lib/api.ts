// Cliente HTTP del backend pemie-api. El frontend es puro cliente: toda la
// lógica de negocio vive en el backend. Aquí solo hay transporte + tipos.

import type { Role } from "@pemie/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Base pública del API (para construir el endpoint MCP, enlaces, etc.). */
export const API_BASE = API_URL;

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
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/** Base de rutas de un proyecto. */
const pp = (wsSlug: string, projectSlug: string) =>
  `/api/workspaces/${wsSlug}/projects/${projectSlug}`;

/** Construye un query string a partir de un objeto (ignora undefined/null). */
function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

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

// ─── F2: ingesta ─────────────────────────────────────────────────────
export interface GithubUserRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  description: string | null;
  updatedAt: string;
}
export interface Repo {
  id: string;
  owner: string;
  name: string;
  url: string | null;
  installationId: string | null;
  createdAt: string;
  _count: { commits: number };
}
export interface Contributor {
  id: string;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
}
export interface Commit {
  id: string;
  sha: string;
  message: string;
  domain: string;
  committedAt: string;
  contributor: Contributor;
  repo: { id: string; owner: string; name: string };
}
export interface Stats {
  totalCommits: number;
  repoCount: number;
  byDomain: { key: string; label: string; emoji: string | null; primary: boolean; count: number }[];
  byContributor: { contributor: Contributor | null; count: number }[];
}

// ─── F3: objetivo / informes / notas ─────────────────────────────────
export interface Objective {
  id: string;
  description: string;
  updatedAt: string;
}
export interface Report {
  id: string;
  date: string;
  slot: string;
  scope: string;
  comment: string | null;
  verdict: string | null;
  score: number | null;
  metrics: unknown;
  createdAt: string;
  agent?: { id: string; name: string } | null;
  _count?: { notes: number };
}
export interface Note {
  id: string;
  message: string;
  status: string;
  response: string | null;
  reportId: string | null;
  createdAt: string;
  processedAt: string | null;
  author?: { id: string; name: string | null; email: string } | null;
}

// ─── F5: historias de usuario ────────────────────────────────────────
export interface Epic {
  id: string;
  title: string;
  description: string | null;
  _count: { stories: number };
}
export interface UserStory {
  id: string;
  key: string;
  title: string;
  narrative: { role: string; want: string; benefit: string } | null;
  acceptanceCriteria: { given: string; when: string; then: string }[] | null;
  priority: string;
  storyPoints: number | null;
  status: string;
  epicId: string | null;
  epic?: { id: string; title: string } | null;
  createdAt: string;
}

// ─── F4: agentes / API keys / audit ──────────────────────────────────
export interface Agent {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
  _count: { apiKeys: number };
}
export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  projectId: string | null;
  agentId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}
export interface AuditLog {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
}

// ─── F6: kanban ──────────────────────────────────────────────────────
export interface Card {
  id: string;
  columnId: string;
  order: number;
  type: string;
  title: string;
  description: string | null;
  userStoryId: string | null;
  userStory?: { id: string; key: string; title: string; status: string } | null;
}
export interface Column {
  id: string;
  name: string;
  order: number;
  wipLimit: number | null;
  cards: Card[];
}
export interface Board {
  id: string;
  name: string;
  columns: Column[];
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
    githubRepos: () => get<{ repos: GithubUserRepo[] }>("/api/auth/github/repos"),
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

  // Base de rutas por proyecto.
  //   p(ws, prj) => "/api/workspaces/:ws/projects/:prj"

  // ─── F2: ingesta ───────────────────────────────────────────────────
  repos: {
    list: (w: string, p: string) => get<{ repos: Repo[] }>(`${pp(w, p)}/repos`),
    link: (w: string, p: string, input: { owner: string; name: string; url?: string }) =>
      post<{ repo: Repo }>(`${pp(w, p)}/repos`, input),
    unlink: (w: string, p: string, repoId: string) =>
      del<{ ok: true }>(`${pp(w, p)}/repos/${repoId}`),
    backfill: (w: string, p: string, repoId: string) =>
      post<{ fetched: number; ingested: number }>(`${pp(w, p)}/repos/${repoId}/backfill`),
  },
  commits: {
    list: (w: string, p: string, q?: { domain?: string; limit?: number }) =>
      get<{ commits: Commit[] }>(`${pp(w, p)}/commits${qs(q)}`),
  },
  stats: {
    get: (w: string, p: string) => get<{ stats: Stats }>(`${pp(w, p)}/stats`),
  },

  // ─── F3: objetivo / informes / notas ───────────────────────────────
  objective: {
    get: (w: string, p: string) => get<{ objective: Objective | null }>(`${pp(w, p)}/objective`),
    set: (w: string, p: string, description: string) =>
      put<{ objective: Objective }>(`${pp(w, p)}/objective`, { description }),
  },
  reports: {
    list: (w: string, p: string) => get<{ reports: Report[] }>(`${pp(w, p)}/reports`),
    get: (w: string, p: string, id: string) =>
      get<{ report: Report & { notes: Note[] } }>(`${pp(w, p)}/reports/${id}`),
    publish: (w: string, p: string, input: Partial<Report> & { date?: string; scope?: string }) =>
      post<{ report: Report }>(`${pp(w, p)}/reports`, input),
    remove: (w: string, p: string, id: string) => del<{ ok: true }>(`${pp(w, p)}/reports/${id}`),
  },
  notes: {
    list: (w: string, p: string, q?: { status?: string }) =>
      get<{ notes: Note[] }>(`${pp(w, p)}/notes${qs(q)}`),
    create: (w: string, p: string, message: string) =>
      post<{ note: Note }>(`${pp(w, p)}/notes`, { message }),
    answer: (w: string, p: string, id: string, response: string) =>
      post<{ note: Note }>(`${pp(w, p)}/notes/${id}/answer`, { response }),
  },

  // ─── F5: historias de usuario ──────────────────────────────────────
  epics: {
    list: (w: string, p: string) => get<{ epics: Epic[] }>(`${pp(w, p)}/epics`),
    create: (w: string, p: string, input: { title: string; description?: string }) =>
      post<{ epic: Epic }>(`${pp(w, p)}/epics`, input),
  },
  stories: {
    list: (w: string, p: string, q?: { status?: string }) =>
      get<{ userStories: UserStory[] }>(`${pp(w, p)}/user-stories${qs(q)}`),
    create: (w: string, p: string, input: Partial<UserStory> & { title: string }) =>
      post<{ userStory: UserStory }>(`${pp(w, p)}/user-stories`, input),
    update: (w: string, p: string, id: string, patchBody: Partial<UserStory>) =>
      patch<{ userStory: UserStory }>(`${pp(w, p)}/user-stories/${id}`, patchBody),
  },

  // ─── F4: agentes / API keys / audit ────────────────────────────────
  agents: {
    list: (w: string, p: string) => get<{ agents: Agent[] }>(`${pp(w, p)}/agents`),
    create: (w: string, p: string, name: string) =>
      post<{ agent: Agent }>(`${pp(w, p)}/agents`, { name }),
  },
  apiKeys: {
    list: (w: string) => get<{ apiKeys: ApiKeyPublic[] }>(`/api/workspaces/${w}/api-keys`),
    create: (
      w: string,
      input: { name: string; projectId: string; agentId?: string; scopes: string[] }
    ) => post<{ apiKey: ApiKeyPublic; key: string }>(`/api/workspaces/${w}/api-keys`, input),
    revoke: (w: string, id: string) => del<{ ok: true }>(`/api/workspaces/${w}/api-keys/${id}`),
  },
  audit: {
    list: (w: string) => get<{ auditLogs: AuditLog[] }>(`/api/workspaces/${w}/audit`),
  },

  // ─── F6: kanban ────────────────────────────────────────────────────
  board: {
    get: (w: string, p: string) => get<{ board: Board }>(`${pp(w, p)}/board`),
    createCard: (
      w: string,
      p: string,
      input: { title: string; type?: string; description?: string; columnId?: string; userStoryId?: string }
    ) => post<{ card: Card }>(`${pp(w, p)}/board/cards`, input),
    moveCard: (w: string, p: string, id: string, columnId: string, order?: number) =>
      post<{ card: Card }>(`${pp(w, p)}/board/cards/${id}/move`, { columnId, order }),
    updateCard: (w: string, p: string, id: string, patchBody: Partial<Card>) =>
      patch<{ card: Card }>(`${pp(w, p)}/board/cards/${id}`, patchBody),
  },

  invitations: {
    detail: (token: string) =>
      get<{ invitation: InvitationDetail }>(`/api/invitations/${token}`),
    accept: (token: string) =>
      post<{ workspace: Workspace }>(`/api/invitations/${token}/accept`),
  },
};
