// Servidor Node local (npm run dev:api / npm start). En Vercel el punto de
// entrada es la función serverless de `api/server.ts`, que reutiliza la
// misma app de `app.ts`.

import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 pemie-api en http://localhost:${info.port}`);
  console.log(`   front esperado en ${env.WEB_ORIGIN}`);
});
