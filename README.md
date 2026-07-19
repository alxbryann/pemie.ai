# pemie.ai

Plataforma multi-proyecto para que equipos monitoreen sus proyectos — para **personas** (web) y para **agentes** (MCP). Evolución independiente de `gotom-reports` (que sigue desplegado y sin tocar).

## Arquitectura

Monorepo (npm workspaces) con **un backend único** que expone su capa de servicios por tres interfaces, y un **frontend separado** que es puro cliente:

```
apps/
  api/      @pemie/api  — Hono + TS + Prisma/Postgres
            src/services/  ← lógica de negocio (agnóstica del transporte)
            src/rest/      ← interfaz REST   (frontend web)
            src/mcp/       ← interfaz MCP    (agentes, API key + scopes)
            src/auth/      ← GitHub OAuth + email/password
            prisma/schema.prisma
  web/      @pemie/web  — Vite + React + TS + Tailwind (SPA cliente del REST)
packages/
  shared/   @pemie/shared — tipos y constantes compartidos
```

## Desarrollo local

Requisitos: Node ≥ 20, Docker (para Postgres local).

```bash
npm install                 # instala todo el workspace
cp .env.example apps/api/.env
cp .env.example apps/web/.env   # solo VITE_API_URL es relevante para web

npm run db:up               # levanta Postgres en localhost:5433 (docker)
npm run db:migrate          # aplica migraciones Prisma
npm run dev:api             # backend en http://localhost:4000
npm run dev:web             # frontend en http://localhost:5173
```

- Health del backend: `GET http://localhost:4000/api/health`
- Índice de API: `GET http://localhost:4000/api`

## Roadmap (fases)

- **F0** ✅ Scaffolding — monorepo, backend+frontend ejecutables, esquema Prisma completo.
- **F1** ✅ Multi-tenancy — workspaces, membresías, invitaciones, proyectos, auth (email/password + GitHub OAuth, sesiones por cookie).
- **F2** ✅ Ingesta — GitHub App + webhooks (`/webhooks/github`) + clasificación de commits por dominio, backfill vía API y stats por proyecto.
- **F3** ✅ Objetivo (con historial), informes de avance (verdict/score/métricas auto-calculadas de commits) y notas (feedback que se responde), flujo Hermes generalizado.
- **F4** ✅ Interfaz MCP (JSON-RPC sobre HTTP) + API keys con scopes + AuditLog. Los agentes autentican por API key (Bearer) y cada `tools/call` se audita.
- **F5** ✅ Historias de Usuario — épicas + HUs (narrativa role/want/benefit + criterios Given/When/Then), keys incrementales por proyecto; creables por agente vía MCP.
- **F6** ✅ Kanban — tablero con columnas por defecto, tarjetas (ligables a HUs) con orden y registro de actividad; movibles por agente vía MCP.
- **F7** Migración de datos gotom + deploy AWS.
