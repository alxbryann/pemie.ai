// Punto de entrada del API en Vercel: la MISMA app Hono que corre en local
// (apps/api/src/app.ts), expuesta como función serverless.
//
// Vive junto al front en el mismo proyecto/dominio a propósito: la cookie de
// sesión queda first-party (no la bloquean Safari/Chrome), no hace falta CORS y
// el endpoint MCP es público en https://<dominio>/mcp.
//
// El nombre del archivo es estático (no `[...path]`) porque las `routes` de
// vercel.json mandan aquí todo `/api/**`, `/mcp` y `/webhooks/**`: el `dest`
// solo elige la función, la ruta original llega intacta y la enruta Hono.

import { handle } from "@hono/node-server/vercel";
import { app } from "../apps/api/src/app.js";

// Vercel parsea el body por defecto; hay que desactivarlo para que Hono lea el
// stream (la firma HMAC de los webhooks de GitHub se calcula sobre el cuerpo
// crudo, así que no puede consumirlo nadie antes).
export const config = { api: { bodyParser: false } };

export default handle(app);
