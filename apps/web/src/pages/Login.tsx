import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { api, ApiError } from "../lib/api.js";
import { Button, Card, ErrorText, Field, Input } from "../components/ui.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(oauthError(params.get("error")));
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Entra a pemie.ai" subtitle="Monitorea tus proyectos y equipos.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Contraseña">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> o <div className="h-px flex-1 bg-slate-200" />
      </div>
      <a href={api.auth.githubUrl()}>
        <Button variant="ghost" className="w-full">
          Continuar con GitHub
        </Button>
      </a>

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿No tienes cuenta?{" "}
        <Link to="/register" className="font-medium text-brand hover:underline">
          Regístrate
        </Link>
      </p>
    </AuthShell>
  );
}

function oauthError(code: string | null): string | null {
  if (!code) return null;
  if (code === "oauth_state") return "La sesión de GitHub expiró. Intenta de nuevo.";
  return "No se pudo iniciar sesión con GitHub.";
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-fg">
          p
        </div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <Card>{children}</Card>
    </div>
  );
}
