import { useEffect, useState } from "react";
import {
  CHANNEL_LLM_PROVIDERS,
  CHANNEL_LLM_DEFAULT_MODELS,
  CHANNEL_LLM_MODELS,
  type ChannelLlmProvider,
} from "@pemie/shared";
import { api, ApiError, type TelegramChannelStatus } from "../lib/api.js";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  ErrorText,
  Input,
  Select,
  SkeletonCard,
} from "./ui.js";

const LLM_PROVIDER_LABELS: Record<ChannelLlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

const LLM_KEY_PLACEHOLDER: Record<ChannelLlmProvider, string> = {
  anthropic: "sk-ant-… (Anthropic)",
  openai: "sk-… (OpenAI)",
  deepseek: "sk-… (DeepSeek)",
};

export type TelegramProjectOption = { id: string; slug: string; name: string };

/**
 * Canal Telegram (BYOK). `projects` son candidatos a defaultProject / deep link.
 * Si hay varios, el usuario elige; si hay uno, se usa ese.
 */
export function TelegramChannelCard({ projects }: { projects: TelegramProjectOption[] }) {
  const [status, setStatus] = useState<TelegramChannelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [startPayload, setStartPayload] = useState<string | null>(null);
  const [llmKey, setLlmKey] = useState("");
  const [llmProvider, setLlmProvider] = useState<ChannelLlmProvider>("anthropic");
  const [llmModel, setLlmModel] = useState(CHANNEL_LLM_DEFAULT_MODELS.anthropic);
  const [homeProjectId, setHomeProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const r = await api.channels.telegramStatus();
      setStatus(r.channel);
      if (r.channel.llmProvider) setLlmProvider(r.channel.llmProvider);
      if (r.channel.model) setLlmModel(r.channel.model);
      const fromStatus = r.channel.defaultProject?.id;
      if (fromStatus && projects.some((p) => p.id === fromStatus)) {
        setHomeProjectId(fromStatus);
      } else if (projects[0]) {
        setHomeProjectId(projects[0].id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando Telegram");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.map((p) => p.id).join(",")]);

  async function createLink() {
    if (!homeProjectId) {
      setError("Crea un proyecto en el workspace antes de vincular Telegram");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.createLinkToken(homeProjectId);
      setDeepLink(r.deepLink);
      setStartPayload(r.startPayload);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el enlace");
    } finally {
      setBusy(false);
    }
  }

  async function saveLlmKey(e: React.FormEvent) {
    e.preventDefault();
    if (llmKey.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.setLlmKey(llmKey.trim(), {
        provider: llmProvider,
        model: llmModel || CHANNEL_LLM_DEFAULT_MODELS[llmProvider],
      });
      setStatus(r.channel);
      setLlmKey("");
      if (homeProjectId) await api.channels.setDefaultProject(homeProjectId);
      const refreshed = await api.channels.telegramStatus();
      setStatus(refreshed.channel);
      if (refreshed.channel.model) setLlmModel(refreshed.channel.model);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la key");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLlmKey(provider: ChannelLlmProvider) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.deleteLlmKey(provider);
      setStatus(r.channel);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar la key");
    } finally {
      setBusy(false);
    }
  }

  async function saveDefaultProject() {
    if (!homeProjectId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.channels.setDefaultProject(homeProjectId);
      setStatus(r.channel);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo fijar el proyecto");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.channels.disconnect();
      setDeepLink(null);
      setStartPayload(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo desvincular");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonCard lines={3} />;

  const savedProviders = status?.providers
    ? CHANNEL_LLM_PROVIDERS.filter((p) => status.providers[p]?.hasKey)
    : [];

  const stateLabel = !status?.botConfigured
    ? "Bot no configurado en el servidor"
    : !status.linked
      ? "No vinculado"
      : !status.hasLlmKey
        ? "Falta API key LLM"
        : status.ready
          ? "Listo"
          : "Incompleto";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-h4 text-ink-900">Canal Telegram</h3>
          <p className="mt-2 text-body-sm text-ink-600">
            Habla con Pemie desde Telegram (BYOK: Anthropic, OpenAI o DeepSeek). Al vincular se
            crea una API key de usuario MCP para tus proyectos.
          </p>
        </div>
        <Badge tone={status?.ready ? "brand" : "neutral"}>{stateLabel}</Badge>
      </div>

      <ErrorText>{error}</ErrorText>

      {!status?.botConfigured ? (
        <p className="mt-4 text-body-sm text-ink-500">
          Configura <code className="font-mono text-caption">TELEGRAM_BOT_TOKEN</code>,{" "}
          <code className="font-mono text-caption">TELEGRAM_BOT_USERNAME</code>,{" "}
          <code className="font-mono text-caption">TELEGRAM_WEBHOOK_SECRET</code> y{" "}
          <code className="font-mono text-caption">CHANNEL_SECRETS_KEY</code> en el servidor.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {status.linked && (
            <p className="text-body-sm text-ink-600">
              Vinculado como{" "}
              <span className="font-medium">@{status.telegramUsername ?? "usuario"}</span>
              {status.hasLlmKey && (
                <>
                  {" "}
                  · {LLM_PROVIDER_LABELS[status.llmProvider]}{" "}
                  <code className="font-mono text-caption">…{status.llmKeyLast4}</code>
                </>
              )}
              {status.apiKeyPrefix && (
                <>
                  {" "}
                  · MCP key <code className="font-mono text-caption">{status.apiKeyPrefix}…</code>
                </>
              )}
              {status.defaultProject && (
                <>
                  {" "}
                  · proyecto <code className="font-mono text-caption">{status.defaultProject.slug}</code>
                </>
              )}
            </p>
          )}

          {projects.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem]">
                <p className="mb-1 text-caption font-mono uppercase text-ink-500">
                  Proyecto por defecto
                </p>
                <Select
                  value={homeProjectId}
                  onChange={(e) => setHomeProjectId(e.target.value)}
                  aria-label="Proyecto por defecto de Telegram"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </Select>
              </div>
              {status.linked && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={saveDefaultProject}
                  disabled={busy || !homeProjectId}
                >
                  Guardar default
                </Button>
              )}
            </div>
          )}

          {!status.linked && (
            <div className="space-y-2">
              <Button type="button" onClick={createLink} disabled={busy || !homeProjectId}>
                {busy ? "Generando…" : "Generar enlace de vínculo"}
              </Button>
              {projects.length === 0 && (
                <p className="text-caption text-ink-400">
                  Necesitas al menos un proyecto en el workspace para vincular.
                </p>
              )}
              {deepLink && (
                <p className="text-body-sm">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Abrir en Telegram
                  </a>
                </p>
              )}
              {!deepLink && startPayload && (
                <CodeBlock title="En el bot, envía">{`/start ${startPayload}`}</CodeBlock>
              )}
              {deepLink && startPayload && (
                <p className="font-mono text-caption text-ink-400">o /start {startPayload}</p>
              )}
            </div>
          )}

          {status.linked && status.providers && (
            <div className="space-y-2">
              <p className="text-caption text-ink-500">
                Keys guardadas. En Telegram: /proveedor, /modelo, /reset.
              </p>
              {savedProviders.length === 0 ? (
                <p className="text-caption text-ink-400">
                  Ninguna todavía: pega una key abajo para activar el bot.
                </p>
              ) : (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {savedProviders.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <span className="text-caption text-ink-600">
                        {LLM_PROVIDER_LABELS[p]}{" "}
                        <code className="font-mono">…{status.providers[p].last4}</code>
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteLlmKey(p)}
                        disabled={busy}
                        aria-label={`Borrar la API key de ${LLM_PROVIDER_LABELS[p]}`}
                      >
                        Borrar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {status.linked && (
            <form onSubmit={saveLlmKey} className="flex flex-wrap gap-2">
              <Select
                value={llmProvider}
                onChange={(e) => {
                  const p = e.target.value as ChannelLlmProvider;
                  setLlmProvider(p);
                  setLlmModel(CHANNEL_LLM_DEFAULT_MODELS[p]);
                }}
                aria-label="Proveedor LLM"
              >
                {CHANNEL_LLM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {LLM_PROVIDER_LABELS[p]}
                    {status.providers?.[p]?.hasKey ? " ✓" : ""}
                  </option>
                ))}
              </Select>
              <Select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                aria-label="Modelo LLM"
              >
                {(CHANNEL_LLM_MODELS[llmProvider] ?? [CHANNEL_LLM_DEFAULT_MODELS[llmProvider]]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              </Select>
              <Input
                type="password"
                placeholder={
                  status.providers?.[llmProvider]?.hasKey
                    ? `Key actual …${status.providers[llmProvider].last4}`
                    : LLM_KEY_PLACEHOLDER[llmProvider]
                }
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                className="max-w-md min-w-0 flex-1"
                aria-label="API key LLM"
              />
              <Button type="submit" disabled={busy || llmKey.trim().length < 20} variant="secondary">
                Guardar key
              </Button>
            </form>
          )}

          {status.linked && (
            <Button type="button" variant="danger" size="sm" onClick={disconnect} disabled={busy}>
              Desvincular
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
