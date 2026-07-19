// Cliente de GitHub App para la ingesta (F2). Sin dependencias externas:
// firma el JWT de app con node:crypto (RS256) y usa fetch para la REST de
// GitHub. El OAuth de *login* vive aparte en ./github-oauth.ts.

import { createSign, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

export function githubAppConfigured(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

const API = "https://api.github.com";
const UA = "pemie.ai";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * JWT de app (RS256) para autenticarse como la GitHub App. Vale ~9 min; se
 * genera on-demand por cada intercambio por un installation token.
 */
function appJwt(): string {
  if (!githubAppConfigured()) throw new Error("GitHub App no configurada");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: env.GITHUB_APP_ID })
  );
  const data = `${header}.${payload}`;
  // La private key en el .env suele venir con "\n" literales.
  const key = env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signature = base64url(createSign("RSA-SHA256").update(data).sign(key));
  return `${data}.${signature}`;
}

function appHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${appJwt()}`,
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function tokenHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Cache de installation tokens (válidos ~1h) para no re-firmar en cada request.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Obtiene (y cachea) un installation access token para hablar con los repos. */
async function installationToken(installationId: string): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: appHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub App installation token: ${res.status}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  });
  return data.token;
}

export interface GithubRepo {
  externalId: string;
  owner: string;
  name: string;
  url: string;
  private: boolean;
}

/** Repos accesibles por una instalación de la app (para elegir cuál vincular). */
export async function listInstallationRepos(installationId: string): Promise<GithubRepo[]> {
  const token = await installationToken(installationId);
  const res = await fetch(`${API}/installation/repositories?per_page=100`, {
    headers: tokenHeaders(token),
  });
  if (!res.ok) throw new Error(`GitHub App repositories: ${res.status}`);
  const data = (await res.json()) as {
    repositories: {
      id: number;
      name: string;
      html_url: string;
      private: boolean;
      owner: { login: string };
    }[];
  };
  return data.repositories.map((r) => ({
    externalId: String(r.id),
    owner: r.owner.login,
    name: r.name,
    url: r.html_url,
    private: r.private,
  }));
}

export interface NormalizedCommit {
  sha: string;
  message: string;
  committedAt: Date;
  login: string | null;
  authorName: string | null;
  avatarUrl: string | null;
}

/**
 * Trae commits recientes de un repo vía la API (backfill inicial). `since`
 * limita a commits posteriores a esa fecha; sin él trae la última página.
 */
export async function fetchRecentCommits(
  installationId: string,
  owner: string,
  name: string,
  since?: Date
): Promise<NormalizedCommit[]> {
  const token = await installationToken(installationId);
  const url = new URL(`${API}/repos/${owner}/${name}/commits`);
  url.searchParams.set("per_page", "100");
  if (since) url.searchParams.set("since", since.toISOString());

  const res = await fetch(url, { headers: tokenHeaders(token) });
  if (!res.ok) throw new Error(`GitHub commits ${owner}/${name}: ${res.status}`);
  const data = (await res.json()) as {
    sha: string;
    commit: { message: string; author: { name: string | null; date: string } | null };
    author: { login: string; avatar_url: string } | null;
  }[];

  return data.map((c) => ({
    sha: c.sha,
    message: c.commit?.message ?? "",
    committedAt: c.commit?.author?.date ? new Date(c.commit.author.date) : new Date(),
    login: c.author?.login ?? null,
    authorName: c.commit?.author?.name ?? null,
    avatarUrl: c.author?.avatar_url ?? null,
  }));
}

/**
 * Verifica la firma HMAC-SHA256 (`X-Hub-Signature-256`) de un webhook contra
 * el cuerpo crudo. Comparación en tiempo constante. Sin secreto configurado o
 * sin firma => inválido.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.GITHUB_APP_WEBHOOK_SECRET || !signature) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", env.GITHUB_APP_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
