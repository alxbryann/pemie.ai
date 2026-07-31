// Wrapper de PostHog para el cliente (browser). Singleton de módulo
// inicializado una sola vez en el root de la app (main.tsx) — nunca en
// Layout.tsx ni por página, para no duplicar el SDK entre remounts. Consume
// el catálogo agnóstico de @pemie/shared; nunca declara eventos por su cuenta.
//
// Dos guards de dedupe distintos y complementarios (ver
// PLANS/PEMIE_POSTHOG_UX_CONSENT_EVENT_MAP.md §2/§4):
// 1. Este módulo: init del SDK, una sola vez, a nivel de módulo (`initialized`).
// 2. Cada efecto que dispara un evento de carga: su propio ref nuevo (patrón de
//    CommitsTab.tsx) — no reusa nada de aquí.

import posthog from "posthog-js";
import {
  sanitizeAnalyticsProperties,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
} from "@pemie/shared";

let initialized = false;

/** Init único a nivel de módulo. Llamar una sola vez, desde main.tsx antes del render. */
export function initAnalytics(): void {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();
  if (!key) {
    if (import.meta.env.DEV) {
      throw new Error(
        "VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured"
      );
    }
    return;
  }
  if (!host) {
    if (import.meta.env.DEV) {
      throw new Error(
        "VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured"
      );
    }
    return;
  }
  initialized = true;
  posthog.init(key, {
    api_host: host,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    person_profiles: "identified_only",
  });
}

/** `identify()` — login/register/accept-invite exitosos. distinct_id = user.id, nunca el email. */
export function identifyUser(user: { id: string; email: string }): void {
  if (!initialized) return;
  posthog.identify(user.id, { email: user.email });
}

/** `opt_in_capturing()`/`opt_out_capturing()` — hidratación inicial y toggle en /settings. */
export function applyAnalyticsConsent(enabled: boolean): void {
  if (!initialized) return;
  if (enabled) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

/** `reset()` al logout — evita que el siguiente usuario en el mismo navegador herede identidad. */
export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
  posthog.opt_out_capturing(); // sin tracking pre-login: vuelve al estado seguro
}

/**
 * Registra un evento declarado en el catálogo. No-op si el SDK no está inicializado.
 *
 * El guardrail (`sanitizeAnalyticsProperties`) lanza en dev ante una instrumentación
 * inválida — a propósito, para que se note. Pero eso nunca debe filtrarse al `catch`
 * de negocio del caller (login, crear HU, etc.) y hacerle mostrar un error falso al
 * usuario: se atrapa acá, se loguea fuerte, y el evento se descarta.
 */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties?: AnalyticsEventProperties<E>
): void {
  if (!initialized) return;
  try {
    const safeProperties = sanitizeAnalyticsProperties(event, properties, {
      strict: import.meta.env.DEV,
    });
    posthog.capture(event, safeProperties);
  } catch (err) {
    console.error(`[analytics] evento "${event}" descartado (instrumentación inválida):`, err);
  }
}
