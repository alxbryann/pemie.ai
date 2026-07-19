// Tipos y helpers compartidos por los routers REST.

import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { User } from "@prisma/client";
import { isProd } from "../env.js";
import { unauthorized } from "../services/errors.js";
import * as auth from "../services/auth.js";

export const SESSION_COOKIE = "pemie_session";

/** Variables que los middlewares dejan en el contexto Hono. */
export type AppEnv = { Variables: { user: User | null } };
export type AppContext = Context<AppEnv>;

/** Escribe la cookie de sesión httpOnly. */
export function setSessionCookie(c: AppContext, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProd ? "None" : "Lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: AppContext) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Resuelve el usuario de la cookie y lo deja en el contexto (o null). */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await auth.userFromSession(token);
  c.set("user", user);
  await next();
};

/** Exige usuario autenticado; devuelve el user no-nulo. */
export function requireUser(c: AppContext): User {
  const user = c.get("user");
  if (!user) throw unauthorized();
  return user;
}
