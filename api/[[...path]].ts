// Punto de entrada del API en Vercel: la MISMA app Hono que corre en local
// (apps/api/src/app.ts), expuesta como función serverless bajo /api/**.
//
// Vive junto al front en el mismo proyecto/dominio a propósito: la cookie de
// sesión queda first-party (no la bloquean Safari/Chrome), no hace falta CORS y
// el endpoint MCP es público en https://<dominio>/mcp.

import { handle } from "@hono/node-server/vercel";
import { app } from "../apps/api/src/app.js";

// Vercel parsea el body por defecto; hay que desactivarlo para que Hono lea el
// stream (la firma HMAC de los webhooks de GitHub se calcula sobre el cuerpo
// crudo, así que no puede consumirlo nadie antes).
export const config = { api: { bodyParser: false } };

export default handle(app);
