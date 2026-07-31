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
  if (!key) return; // sin credencial: la app funciona igual, solo sin analítica
  initialized = true;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false, // solo eventos declarados en el catálogo, nada implícito
    disable_session_recording: true, // excluido del MVP
    advanced_disable_feature_flags: true, // excluido del MVP
    // Estado seguro hasta que se conozca el usuario real: AuthProvider llama
    // applyAnalyticsConsent() apenas resuelve /me (o se queda opt-out si no hay sesión).
    opt_out_capturing_by_default: true,
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

/** Registra un evento declarado en el catálogo. No-op si el SDK no está inicializado. */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties?: AnalyticsEventProperties<E>
): void {
  if (!initialized) return;
  const safeProperties = sanitizeAnalyticsProperties(event, properties, {
    strict: import.meta.env.DEV,
  });
  posthog.capture(event, safeProperties);
}
