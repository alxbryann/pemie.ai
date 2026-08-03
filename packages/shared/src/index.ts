// Tipos y constantes compartidos entre el backend (apps/api) y el frontend (apps/web).
// Mantener agnóstico de runtime: sin imports de Node ni del navegador.

export * from "./analytics.js";
export * from "./mcp-tools.js";

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

/** Alcance de una API key MCP. */
export const API_KEY_SCOPE_LEVELS = ["project", "workspace", "user"] as const;
export type ApiKeyScopeLevel = (typeof API_KEY_SCOPE_LEVELS)[number];

/** Proveedores LLM BYOK para el canal Telegram. */
export const CHANNEL_LLM_PROVIDERS = ["anthropic", "openai", "deepseek"] as const;
export type ChannelLlmProvider = (typeof CHANNEL_LLM_PROVIDERS)[number];

export const CHANNEL_LLM_DEFAULT_MODELS: Record<ChannelLlmProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o",
  deepseek: "deepseek-chat",
};

/** Modelos seleccionables por proveedor (Telegram + UI). */
export const CHANNEL_LLM_MODELS: Record<ChannelLlmProvider, readonly string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

export function listModelsForProvider(provider: ChannelLlmProvider): readonly string[] {
  return CHANNEL_LLM_MODELS[provider] ?? [CHANNEL_LLM_DEFAULT_MODELS[provider]];
}

export function isAllowedModel(provider: ChannelLlmProvider, model: string): boolean {
  return listModelsForProvider(provider).includes(model);
}

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

/**
 * Formatea la narrativa de una HU como una sola frase legible ("Como <rol>,
 * quiero <want> para <benefit>"). Devuelve `null` si falta la narrativa o
 * alguno de sus tres campos, para que el caller pueda omitir el bloque en vez
 * de mostrar una frase a medias.
 */
export function formatNarrative(narrative: UserStoryNarrative | null | undefined): string | null {
  if (!narrative?.role || !narrative?.want || !narrative?.benefit) return null;
  return `Como ${narrative.role}, quiero ${narrative.want} para ${narrative.benefit}`;
}
