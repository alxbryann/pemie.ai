# Deploy en Vercel — front + API en un solo dominio

pemie.ai se despliega como **un único proyecto de Vercel** (`pemie.ai` →
`https://pemieai.vercel.app`): el front es el build estático de `apps/web`, y el
API (Hono) corre como función serverless en `api/server.ts`, que reutiliza la
misma app de `apps/api/src/app.ts` que levanta el servidor local.

Que compartan dominio no es casual, resuelve tres cosas de golpe:

- la cookie de sesión es **first-party** (`SameSite=Lax; Secure`), así que no la
  bloquean Safari ni Chrome como pasaría con un API en otro dominio;
- **no hace falta CORS** ni configurar `VITE_API_URL`: el front llama a `/api/*`
  relativo, de modo que producción y cada preview apuntan a su propio API;
- el endpoint MCP queda público en `https://<dominio>/mcp`.

## Rutas

| URL pública | Sirve |
| --- | --- |
| `/api/**` | función serverless (REST) |
| `/mcp` | interfaz MCP para agentes |
| `/webhooks/github` | ingesta de commits |
| `/webhooks/telegram` | bot Telegram (canal on-demand) |
| assets (`/assets/**`, `/favicon.svg`) | estáticos del build |
| todo lo demás (`/login`, `/w/:slug`, `/invite/:token`, …) | SPA (`index.html`) |

El orden importa y por eso `vercel.json` usa `routes` explícitas en vez de
`rewrites`: los `rewrites` se evalúan **antes** de las rutas de las funciones, así
que un catch-all a `index.html` se come toda la API (síntoma: `/api/health`
devuelve el HTML del front). Con `routes`, las tres primeras reglas mandan a la
función, luego `handle: filesystem` sirve los assets y solo al final cae el
fallback del SPA — que es lo que hace que refrescar en `/login` o abrir un link de
invitación no dé 404.

En las reglas, `dest` solo **elige** la función: la ruta original llega intacta a
la app, así que Hono enruta `/api/auth/login`, `/mcp` y `/webhooks/github` igual
que en local.

## Base de datos (producción)

**AWS RDS PostgreSQL 16.13** — instancia `pemie-db`, `db.t4g.micro`, 20 GB,
backups 7 días, en **us-east-2**:

```
pemie-db.c922mw6yaf13.us-east-2.rds.amazonaws.com:5432  ·  base pemie  ·  usuario pemie
```

Tres detalles que no son opcionales:

- **`sslmode=require`**: el parameter group tiene `rds.force_ssl=1`, sin eso la
  conexión se rechaza.
- **`connection_limit=1`** (parámetro de Prisma): la instancia admite
  `max_connections=79` y cada instancia serverless caliente mantiene su propio
  pool. Sin límite, un pico de tráfico agota las conexiones de la base.
- El **security group `sg-063f81d4228ff5d26` está abierto a `0.0.0.0/0`** en el
  5432, porque las funciones de Vercel salen con IPs dinámicas y no hay forma de
  allowlistearlas (IP estática es *Secure Compute*, solo Enterprise). La base
  está expuesta a internet: lo que la protege es TLS obligatorio y la contraseña.
  Si algún día quieres cerrarla, la salida es un pooler con IP fija (pgBouncer en
  una EC2, o RDS Proxy) y allowlistear solo esa IP.

La URL completa ya está guardada como `DATABASE_URL` en el proyecto de Vercel
(Production y Preview). Para recuperarla: `vercel env pull`.

⚠️ **Preview comparte la base de producción.** Es cómodo para verificar un deploy,
pero cualquier prueba en un preview escribe en los datos reales. Si molesta:
`vercel env rm DATABASE_URL preview` y crea una base aparte.

### Migraciones

No corren en el build (el build no debería tocar la DB). Se aplican a mano:

```bash
DATABASE_URL='<url-de-produccion>' npm run db:deploy --workspace @pemie/api
```

El cliente de Prisma se genera en el `installCommand`, y el schema declara
`binaryTargets = ["native", "rhel-openssl-3.0.x"]` porque las funciones de Vercel
corren en Amazon Linux 2023 (OpenSSL 3); sin ese target el motor de query no
entra en el bundle.

## Variables de entorno en Vercel

| Variable | Valor | Estado |
| --- | --- | --- |
| `DATABASE_URL` | RDS con `sslmode=require&connection_limit=1` | ✅ puesta (Production + Preview) |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | de la OAuth App de GitHub | ⬜ falta (login con GitHub) |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_WEBHOOK_SECRET` | de la GitHub App | ⬜ falta (ingesta de repos) |
| `RESEND_API_KEY` / `MAIL_FROM` | envío real de invitaciones | ⬜ falta (si no, se comparte el link) |
| `ANTHROPIC_API_KEY` | generación server-side | opcional |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_WEBHOOK_SECRET` | bot Telegram | ⬜ si usas el canal |
| `CHANNEL_SECRETS_KEY` | AES-256 (base64, 32 bytes) para BYOK Anthropic | ⬜ si usas Telegram |

**No setees `VITE_API_URL` ni `WEB_ORIGIN`.** Vacías, el front usa su mismo origen
y el API deriva los redirects del host real de la petición (por `x-forwarded-*`),
que es justo lo que hace funcionar los previews. Setéalas solo si algún día el API
se separa a otro dominio. Tampoco hace falta `NODE_ENV` (Vercel ya la pone) ni
`SESSION_SECRET`: sigue declarada en `env.ts` pero **no la lee nadie** — las
sesiones son tokens aleatorios guardados en la tabla `sessions`, así que su
default hardcodeado no es un agujero de seguridad. Está puesta en Production de
todos modos, por si algún día se empieza a usar.

## GitHub OAuth

En la OAuth App (*Settings → Developer settings → OAuth Apps*), el
**Authorization callback URL** debe ser:

```
https://<tu-dominio>/api/auth/github/callback
```

Una OAuth App admite un solo callback, así que para probar en local conviene una
segunda app con `http://localhost:4000/api/auth/github/callback`. El
`redirect_uri` ya no está hardcodeado: se construye con el host de la petición,
por eso el mismo código sirve en local, en prod y en previews.

Si quieres que los **previews** también hagan login con GitHub, necesitas una
OAuth App por dominio de preview (o usar login por email+password ahí).

## Webhooks de GitHub

En la GitHub App, *Webhook URL*: `https://<tu-dominio>/webhooks/github`, con el
mismo secreto que `GITHUB_APP_WEBHOOK_SECRET`. La firma HMAC se valida sobre el
cuerpo crudo; por eso la función declara `config = { api: { bodyParser: false } }`
y además lee el stream de `IncomingMessage` ella misma (ver más abajo).

## Canal Telegram

1. Crea un bot en [@BotFather](https://t.me/BotFather) y copia el token.
2. Genera secretos: `openssl rand -hex 32` (webhook) y `openssl rand -base64 32` (CHANNEL_SECRETS_KEY).
3. Variables en Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (sin `@`),
   `TELEGRAM_WEBHOOK_SECRET`, `CHANNEL_SECRETS_KEY`.
4. Registra el webhook (una vez desplegado):

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://<tu-dominio>/webhooks/telegram" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

### Smoke test

1. En Pemie → proyecto → Agente → **Canal Telegram**: generar enlace y abrir en Telegram (`/start`).
2. Elegir proveedor (Anthropic / OpenAI / DeepSeek), pegar API key (BYOK) y guardar.
3. En el bot: `/estado` (debe decir listo) → pregunta p. ej. “lista mis proyectos” o “muéstrame el tablero”.
4. Comprobar AuditLog en el workspace (`mcp.list_projects`, `mcp.list_board`, …).
5. `/desvincular` invalida el uso del bot hasta volver a vincular.

## Trampas del runtime serverless (todas costaron un deploy caído)

Tres cosas rompen la función en producción sin dar la cara en local, porque en
local nada de esto pasa por el runtime de Vercel:

1. **`"type": "module"` en el `package.json` raíz es obligatorio.** Vercel emite
   `api/server.js` conservando los `import` ESM, y Node decide el formato por el
   `package.json` más cercano. `api/` no tiene uno, así que manda el de la raíz:
   sin `type: module` la función muere con `SyntaxError: Cannot use import
   statement outside a module` → `FUNCTION_INVOCATION_FAILED` en **todas** las
   rutas.
2. **Los paquetes de workspace tienen que emitir JS.** `@pemie/shared` exponía
   `main: ./src/index.ts` y Node no puede cargar TypeScript: `ERR_MODULE_NOT_FOUND`.
   Ahora compila a `dist/` y reparte por condición de `exports` (`development` →
   `src` para Vite en dev, `default` → `dist` en runtime y build). Y `apps/api`
   **debe declararlo en `dependencies`** o el tracer de Vercel no lo mete en el bundle.
3. **El body hay que leerlo a mano.** Con `handle()` de `@hono/node-server/vercel`
   todo POST se colgaba hasta el timeout de 30 s: `await c.req.json()` nunca
   resolvía. `api/server.ts` traduce `IncomingMessage → Request` explícitamente,
   lo que de paso conserva el cuerpo crudo para el HMAC de los webhooks.

Los `GET` sobreviven a la tercera, así que un `/api/health` en verde **no**
prueba que el API funcione: hay que probar un POST.

## Qué NO subir al deploy

`.vercelignore` excluye los `.env*`. Al desplegar con el CLI (`vercel --prod`)
esos archivos viajan aunque estén en `.gitignore`, y Vite hornea sus `VITE_*` en
el bundle: así fue como el front publicado acabó mandando el login a
`http://localhost:4000`. Como red de seguridad, `apps/web/src/lib/api.ts` ignora
un `VITE_API_URL` que apunte a localhost en un build de producción.

## Conectar un agente por MCP

Con el deploy arriba, la pestaña **Agente** de cada proyecto ya muestra el
endpoint correcto (`https://<dominio>/mcp`) y el system prompt con las tools.

```bash
curl -X POST https://<tu-dominio>/mcp \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Notas de compatibilidad:

- El transporte es JSON-RPC 2.0 sobre HTTP POST, sin SSE. `GET /mcp` con
  `Accept: text/event-stream` responde 405 (lo que la especificación indica para
  "no ofrezco stream"), y el descriptor JSON sigue disponible en un GET normal.
- La autenticación es API key por `Authorization: Bearer`, no OAuth. Sirve con
  clientes que permiten cabeceras propias (p. ej. `claude mcp add --transport
  http pemie https://<dominio>/mcp --header "Authorization: Bearer <key>"`); un
  conector que exija OAuth no encaja todavía.
- Cada key declara un alcance (`project` por defecto, o `workspace` / `user`).
  Las keys amplias exigen `projectId` en cada tool; usa `list_projects` primero.
  Toda llamada queda en el AuditLog.
- Al ser serverless, la primera llamada tras un rato de inactividad paga un cold
  start (~1s). No hay estado en memoria entre llamadas, y el servidor MCP es
  stateless, así que no afecta la corrección.

## Checklist de verificación tras desplegar

```bash
curl https://<dominio>/api/health        # {"status":"ok","db":"ok"}
curl https://<dominio>/mcp               # descriptor con tools y scopes
curl -I https://<dominio>/login          # 200 (no 404: fallback SPA)
```

Y en el navegador: registrarse/entrar, refrescar en una ruta interna (no debe dar
404) y comprobar en DevTools que la cookie `pemie_session` se guarda con
`Secure` y `SameSite=Lax` en el dominio del sitio.

Ojo con los **previews**: por defecto tienen *Deployment Protection* activa, así
que responden 302 al SSO de Vercel y no se pueden verificar con `curl` sin un
token de bypass.
