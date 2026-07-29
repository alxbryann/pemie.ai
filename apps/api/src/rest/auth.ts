// Rutas REST de autenticación: email+password, sesión actual y GitHub OAuth.
// Solo traducen HTTP <-> capa de servicios (src/services/auth).

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isProd } from "../env.js";
import * as auth from "../services/auth.js";
import { badRequest } from "../services/errors.js";
import {
  type AppEnv,
  type AppContext,
  requireUser,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  apiOrigin,
  webOrigin,
  safeNextPath,
} from "./http.js";
import * as ingest from "../services/ingest.js";
import {
  githubOAuthConfigured,
  githubAuthorizeUrl,
  exchangeCode,
  fetchProfile,
} from "../lib/github-oauth.js";

const OAUTH_STATE_COOKIE = "pemie_oauth_state";
// Ruta a la que volver al terminar el OAuth (la elige el front con ?next=).
// Va en cookie httpOnly, no en el `state`, para no exponerla en la URL de GitHub.
const OAUTH_NEXT_COOKIE = "pemie_oauth_next";
const OAUTH_TTL_SECONDS = 600;
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
  // El redirect_uri se deriva del origen de la petición (o de PUBLIC_API_URL):
  // así el mismo código sirve en local, en producción y en los previews, sin
  // que quede hardcodeado un localhost. Debe coincidir en /github y /callback.
  const callbackUri = (c: AppContext) => `${apiOrigin(c)}/api/auth/github/callback`;

  app.get("/github", (c) => {
    // Esta ruta se abre navegando (es un enlace, no un fetch): devolver JSON
    // dejaría al usuario mirando un error crudo del backend en una pestaña en
    // blanco. Se vuelve al login, que sabe explicarlo.
    if (!githubOAuthConfigured())
      return c.redirect(`${webOrigin(c)}/login?error=oauth_unconfigured`);
    const state = randomBytes(16).toString("hex");
    const cookieOpts = {
      httpOnly: true,
      sameSite: "Lax" as const,
      secure: isProd,
      path: "/",
      maxAge: OAUTH_TTL_SECONDS,
    };
    setCookie(c, OAUTH_STATE_COOKIE, state, cookieOpts);
    setCookie(c, OAUTH_NEXT_COOKIE, safeNextPath(c.req.query("next")), cookieOpts);
    return c.redirect(githubAuthorizeUrl(state, callbackUri(c)));
  });

  // Repos de GitHub del usuario autenticado (para el selector de vinculación).
  app.get("/github/repos", async (c) => {
    const user = requireUser(c);
    return c.json({ repos: await ingest.listUserGithubRepos(user.id) });
  });

  app.get("/github/callback", async (c) => {
    const front = webOrigin(c);
    const code = c.req.query("code");
    const state = c.req.query("state");
    const expected = getCookie(c, OAUTH_STATE_COOKIE);
    const next = safeNextPath(getCookie(c, OAUTH_NEXT_COOKIE));
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
    deleteCookie(c, OAUTH_NEXT_COOKIE, { path: "/" });
    if (!code || !state || state !== expected)
      return c.redirect(`${front}/login?error=oauth_state`);
    try {
      const accessToken = await exchangeCode(code, callbackUri(c));
      const profile = await fetchProfile(accessToken);
      const { token, expiresAt } = await auth.loginWithGithub({ ...profile, accessToken });
      setSessionCookie(c, token, expiresAt);
      return c.redirect(`${front}${next}`);
    } catch (err) {
      console.error("GitHub OAuth callback error:", err);
      return c.redirect(`${front}/login?error=oauth_failed`);
    }
  });

  return app;
}
