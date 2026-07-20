// Rutas REST de autenticación: email+password, sesión actual y GitHub OAuth.
// Solo traducen HTTP <-> capa de servicios (src/services/auth).

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../env.js";
import * as auth from "../services/auth.js";
import { badRequest } from "../services/errors.js";
import {
  type AppEnv,
  requireUser,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from "./http.js";
import * as ingest from "../services/ingest.js";
import {
  githubOAuthConfigured,
  githubAuthorizeUrl,
  exchangeCode,
  fetchProfile,
} from "../lib/github-oauth.js";

const OAUTH_STATE_COOKIE = "pemie_oauth_state";
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRoutes() {
  const app = new Hono<AppEnv>();

  app.post("/register", async (c) => {
    const body = registerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de registro inválidos", "invalid_body");
    const { user, token, expiresAt } = await auth.register(body.data);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user }, 201);
  });

  app.post("/login", async (c) => {
    const body = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("Datos de login inválidos", "invalid_body");
    const { user, token, expiresAt } = await auth.login(body.data);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user });
  });

  app.post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await auth.logout(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const user = c.get("user");
    return c.json({ user: user ? auth.toPublicUser(user) : null });
  });

  // ─── GitHub OAuth ──────────────────────────────────────────────────
  const redirectUri = `${publicApiOrigin()}/api/auth/github/callback`;

  app.get("/github", (c) => {
    if (!githubOAuthConfigured())
      return c.json({ error: "GitHub OAuth no está configurado" }, 501);
    const state = randomBytes(16).toString("hex");
    setCookie(c, OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    return c.redirect(githubAuthorizeUrl(state, redirectUri));
  });

  // Repos de GitHub del usuario autenticado (para el selector de vinculación).
  app.get("/github/repos", async (c) => {
    const user = requireUser(c);
    return c.json({ repos: await ingest.listUserGithubRepos(user.id) });
  });

  app.get("/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const expected = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
    if (!code || !state || state !== expected)
      return c.redirect(`${env.WEB_ORIGIN}/login?error=oauth_state`);
    try {
      const accessToken = await exchangeCode(code, redirectUri);
      const profile = await fetchProfile(accessToken);
      const { token, expiresAt } = await auth.loginWithGithub({ ...profile, accessToken });
      setSessionCookie(c, token, expiresAt);
      return c.redirect(`${env.WEB_ORIGIN}/`);
    } catch (err) {
      console.error("GitHub OAuth callback error:", err);
      return c.redirect(`${env.WEB_ORIGIN}/login?error=oauth_failed`);
    }
  });

  return app;
}

/** Origen público del API para construir el redirect_uri de OAuth. */
function publicApiOrigin(): string {
  return env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
}
