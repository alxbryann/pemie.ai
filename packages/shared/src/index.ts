// Tipos y constantes compartidos entre el backend (apps/api) y el frontend (apps/web).
// Mantener agnóstico de runtime: sin imports de Node ni del navegador.

export type Role = "owner" | "admin" | "member" | "viewer";

export type ReportScope = "day" | "general";

export type NoteStatus = "pending" | "processed";

export type CardType = "story" | "task" | "bug";

export type ActorType = "user" | "agent";

export type UserStoryStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "review"
  | "done";

/** Scopes de API key para agentes (MCP + REST de agente). */
export const API_SCOPES = [
  "commits:read",
  "reports:read",
  "reports:write",
  "notes:read",
  "notes:write",
  "stories:read",
  "stories:write",
  "board:read",
  "board:write",
  "objective:read",
  "objective:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Configuración de categorías/"dominios" por proyecto. Reemplaza el
 * hardcode tofu/pipeline/reuniones del gotom-reports original: cada
 * proyecto define sus propias categorías y las reglas para clasificarlas.
 */
export interface DomainCategory {
  key: string;
  label: string;
  emoji?: string;
  /** Patrones (regex string) que, si matchean el mensaje del commit, asignan esta categoría. */
  matchers?: string[];
  /** Si es la categoría que cuenta como "avance hacia la meta". */
  primary?: boolean;
}

export interface DomainConfig {
  categories: DomainCategory[];
  /** Categoría por defecto cuando ninguna matchea. */
  fallback: string;
}

/** Config de dominios por defecto (genérica, editable por proyecto). */
export const DEFAULT_DOMAIN_CONFIG: DomainConfig = {
  categories: [
    { key: "feature", label: "Feature", emoji: "✨", primary: true, matchers: ["^feat", "feature"] },
    { key: "fix", label: "Fix", emoji: "🐛", matchers: ["^fix", "bug"] },
    { key: "infra", label: "Infra", emoji: "🏗️", matchers: ["^chore", "^ci", "^build", "deploy", "infra"] },
    { key: "docs", label: "Docs", emoji: "📝", matchers: ["^docs"] },
    { key: "refactor", label: "Refactor", emoji: "♻️", matchers: ["^refactor", "^style", "^perf"] },
  ],
  fallback: "otro",
};

/**
 * Clasifica el mensaje de un commit en una categoría de dominio.
 *
 * Función pura y agnóstica de runtime (usada por la ingesta del backend y por
 * el frontend para previsualizar). Toma la primera línea del mensaje y devuelve
 * la `key` de la primera categoría cuyo matcher (regex, case-insensitive)
 * coincida; si ninguna coincide, devuelve `config.fallback`.
 */
export function classifyCommit(
  message: string,
  config: DomainConfig = DEFAULT_DOMAIN_CONFIG
): string {
  const subject = (message ?? "").split("\n")[0]!.trim();
  for (const category of config.categories) {
    for (const matcher of category.matchers ?? []) {
      let re: RegExp;
      try {
        re = new RegExp(matcher, "i");
      } catch {
        continue; // matcher inválido: se ignora en vez de romper la ingesta
      }
      if (re.test(subject)) return category.key;
    }
  }
  return config.fallback;
}

/** Narrativa canónica de una Historia de Usuario. */
export interface UserStoryNarrative {
  role: string; // Como <role>
  want: string; // quiero <want>
  benefit: string; // para <benefit>
}

/** Criterio de aceptación estilo Gherkin/Given-When-Then. */
export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}
