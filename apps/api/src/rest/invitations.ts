// Rutas REST de invitaciones por token: ver detalle (público) y aceptar (auth).

import { Hono } from "hono";
import * as tenancy from "../services/tenancy.js";
import { type AppEnv, requireUser } from "./http.js";

export function invitationRoutes() {
  const app = new Hono<AppEnv>();

  // Detalle público para pintar la pantalla de aceptación.
  app.get("/:token", async (c) => {
    return c.json({ invitation: await tenancy.getInvitationByToken(c.req.param("token")) });
  });

  app.post("/:token/accept", async (c) => {
    const user = requireUser(c);
    const workspace = await tenancy.acceptInvitation(user.id, c.req.param("token"));
    return c.json({ workspace });
  });

  return app;
}
