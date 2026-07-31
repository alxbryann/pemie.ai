import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { ApiError } from "../lib/api.js";
import { Card, ErrorText, PageHeader, Switch } from "../components/ui.js";

export default function Settings() {
  const { user, setAnalyticsPreference } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null; // ruta protegida: Layout ya garantiza sesión

  async function onToggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setAnalyticsPreference(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la preferencia");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Cuenta" title="Ajustes" description="Preferencias de tu cuenta en pemie.ai." />

      <Card>
        <h3 className="text-h4 text-ink-900">Privacidad</h3>
        <p className="mt-2 max-w-lg text-body-sm text-ink-600">
          Usamos analítica de producto de primera parte (nunca se comparte con terceros para
          publicidad) para entender qué funciona y mejorar pemie.ai. Podés desactivarla en
          cualquier momento — el efecto es inmediato.
        </p>
        <div className="mt-4">
          <Switch
            checked={user.analyticsEnabled}
            onChange={onToggle}
            label="Compartir datos de uso para mejorar pemie.ai"
          />
        </div>
        {busy ? <p className="mt-2 text-caption text-ink-400">Guardando…</p> : null}
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    </div>
  );
}
