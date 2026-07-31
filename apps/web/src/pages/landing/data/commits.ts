export type DemoCommit = { sha: string; message: string; domain: string };

export const DEMO_COMMITS: DemoCommit[] = [
  { sha: "a41f2c9", message: "auth: refresh tokens", domain: "api" },
  { sha: "7d03be1", message: "ci: cache de builds", domain: "infra" },
  { sha: "c9e0d12", message: "kanban: drag por columna", domain: "ui" },
  { sha: "e12aa04", message: "etl: dominios v2", domain: "datos" },
];
