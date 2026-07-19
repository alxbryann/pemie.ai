// Capa de servicios — el corazón agnóstico del transporte.
//
// Toda la lógica de negocio de pemie.ai vive aquí y es consumida por igual
// desde la interfaz REST (apps/api/src/rest) y desde la interfaz MCP
// (apps/api/src/mcp). Ni REST ni MCP deben contener reglas de negocio:
// solo traducen su transporte hacia/desde estas funciones.
//
// Se irá poblando por fase:
//   F1  workspaces / memberships / invitations / projects   -> ./tenancy, ./auth ✓
//   F2  ingesta GitHub + clasificación + stats               -> ./ingest, ./stats
//   F3  objetivo / informes / notas                          -> ./reports
//   F4  api keys / scopes / audit log                        -> ./agents
//   F5  historias de usuario                                 -> ./stories
//   F6  kanban                                               -> ./board

export * as auth from "./auth.js";
export * as tenancy from "./tenancy.js";
export { ServiceError } from "./errors.js";
