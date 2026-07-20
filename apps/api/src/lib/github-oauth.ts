// Cliente mínimo de GitHub OAuth (login). Sin dependencias: usa fetch.
// El flujo lo orquesta el router REST (src/rest/auth.ts).

import { env } from "../env.js";

export function githubOAuthConfigured(): boolean {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

// `repo` permite listar y leer los repos del usuario (incl. privados) para el
// selector de vinculación. `read:user user:email` es para el perfil/login.
const OAUTH_SCOPE = "read:user user:email repo";

/** URL a la que redirigir al usuario para autorizar. */
export function githubAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/** Intercambia el `code` por un access token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`GitHub OAuth: ${data.error ?? "sin access_token"}`);
  return data.access_token;
}

export interface GithubProfile {
  githubId: string;
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/** Trae el perfil y el email primario verificado del usuario. */
export async function fetchProfile(accessToken: string): Promise<GithubProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "pemie.ai",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`GitHub /user: ${userRes.status}`);
  const u = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };

  let email = u.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", { headers });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
    }
  }

  return {
    githubId: String(u.id),
    login: u.login,
    email,
    name: u.name,
    avatarUrl: u.avatar_url,
  };
}

export interface GithubUserRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  description: string | null;
  updatedAt: string;
}

/**
 * Lista los repos accesibles por el usuario (owner, colaborador, miembro de
 * org), ordenados por actualización. Usa el access token OAuth guardado.
 */
export async function fetchUserRepos(accessToken: string): Promise<GithubUserRepo[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "pemie.ai",
  };
  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    { headers }
  );
  if (!res.ok) throw new Error(`GitHub /user/repos: ${res.status}`);
  const repos = (await res.json()) as {
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    description: string | null;
    updated_at: string;
    owner: { login: string };
  }[];
  return repos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    url: r.html_url,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}
