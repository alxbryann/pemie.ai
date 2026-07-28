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

**No setees `VITE_API_URL` ni `WEB_ORIGIN`.** Vacías, el front usa su mismo origen
y el API deriva los redirects del host real de la petición (por `x-forwarded-*`),
que es justo lo que hace funcionar los previews. Setéalas solo si algún día el API
se separa a otro dominio. Tampoco hace falta `NODE_ENV` (Vercel ya la pone) ni
`SESSION_SECRET` (está declarada en `env.ts` pero no se usa: las sesiones son
tokens aleatorios guardados en la tabla `sessions`).

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
cuerpo crudo; por eso la función declara `config = { api: { bodyParser: false } }`.

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
- Cada key está atada a un proyecto y a sus scopes, y toda llamada queda en el
  AuditLog.
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
