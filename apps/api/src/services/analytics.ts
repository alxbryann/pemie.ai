// Wrapper de PostHog server-side. Instrumenta únicamente los eventos `telegram_*`
// (llegan sin sesión de navegador — el bot habla directo con Telegram, no con la
// SPA). Consume el catálogo agnóstico de @pemie/shared; nunca declara eventos
// por su cuenta. Cliente propio, separado del de apps/web/src/lib/analytics
// (credenciales distintas: pública en el navegador, server-side aquí).
//
// Consentimiento: cada caller pasa `analyticsEnabled` explícito desde el `User`
// que ya cargó para autorizar la acción (rest/channels.ts, telegram-bot.ts) —
// nunca un fetch aparte. Si es `false`, no-op silencioso, nunca error.

import { PostHog } from "posthog-node";
import {
  sanitizeAnalyticsProperties,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
} from "@pemie/shared";
import { env, isProd } from "../env.js";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  // `flushAt: 1`: el API corre como función serverless de Vercel (ver
  // docs/deploy-vercel.md) — sin esto el batching por defecto de posthog-node
  // puede perder eventos cuando la función termina antes del próximo flush.
  client = env.POSTHOG_API_KEY?.trim()
    ? new PostHog(env.POSTHOG_API_KEY, { host: env.POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
    : null;
  return client;
}

/**
 * Registra un evento server-side para `userId`, si `analyticsEnabled` es true
 * y hay credencial configurada. No-op silencioso en cualquier otro caso —
 * nunca puede tumbar el flujo de Telegram (webhook o llamada REST) que lo dispara.
 */
export function trackServerEvent<E extends AnalyticsEvent>(
  analyticsEnabled: boolean,
  userId: string,
  event: E,
  properties?: AnalyticsEventProperties<E>
): void {
  if (!analyticsEnabled) return;
  const posthog = getClient();
  if (!posthog) return;
  const safeProperties = sanitizeAnalyticsProperties(event, properties, { strict: !isProd });
  posthog.capture({ distinctId: userId, event, properties: safeProperties });
}
