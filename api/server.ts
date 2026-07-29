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
//
// La traducción IncomingMessage ⇄ Request se hace a mano en vez de usar
// `handle()` de `@hono/node-server/vercel`: con ese adaptador todo POST se
// quedaba colgado hasta el timeout de 30 s (`await c.req.json()` nunca
// resolvía, porque el body nunca llegaba al stream). Hacerlo aquí además nos
// deja leer el cuerpo **crudo**, que es sobre lo que GitHub calcula la firma
// HMAC de los webhooks.

import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../apps/api/src/app.js";

// Petición a Vercel de no tocar el body; leemos el stream nosotros.
export const config = { api: { bodyParser: false } };

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  const response = await app.fetch(await toWebRequest(req));
  await sendResponse(response, res);
}

async function toWebRequest(req: IncomingMessage & { body?: unknown }): Promise<Request> {
  // El host real llega en x-forwarded-host: `req.url` solo trae la ruta y
  // `req.headers.host` puede ser el host interno del proxy.
  const proto = firstHeader(req.headers["x-forwarded-proto"]) ?? "https";
  const host = firstHeader(req.headers["x-forwarded-host"]) ?? req.headers.host ?? "localhost";

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, value);
  }

  const body = await readRawBody(req);
  return new Request(new URL(req.url ?? "/", `${proto}://${host}`), {
    method: req.method ?? "GET",
    headers,
    body,
  });
}

/**
 * Cuerpo crudo de la petición. Si el runtime de Vercel ya consumió el stream y
 * dejó su versión parseada en `req.body`, se reusa esa —re-serializando el JSON
 * como último recurso, lo que puede invalidar una firma HMAC; por eso arriba se
 * pide `bodyParser: false` y el camino normal es leer el stream.
 */
async function readRawBody(req: IncomingMessage & { body?: unknown }): Promise<Buffer | undefined> {
  if (!req.method || req.method === "GET" || req.method === "HEAD") return undefined;

  const parsed = req.body;
  if (Buffer.isBuffer(parsed)) return parsed;
  if (typeof parsed === "string") return Buffer.from(parsed);
  if (parsed !== undefined && parsed !== null) return Buffer.from(JSON.stringify(parsed));

  // Sin body parseado y con el stream ya cerrado no hay nada que leer: seguir
  // esperando chunks colgaría la invocación hasta el timeout.
  if (req.readableEnded) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  return body.length > 0 ? body : undefined;
}

async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;

  // Set-Cookie es la única cabecera que puede repetirse: colapsarla en un
  // string rompería la sesión cuando se manda más de una.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
  });

  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
