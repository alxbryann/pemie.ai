import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { api, ApiError } from "../lib/api.js";
import { Button, Card, ErrorText, Eyebrow, Field, Input, LogoMark, Wordmark } from "../components/ui.js";

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
    <AuthShell eyebrow="ACCESO" title="Entra a pemie.ai" subtitle="Monitorea tus proyectos y equipos.">
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

      <div className="my-4 flex items-center gap-3 text-caption text-ink-400">
        <div className="h-px flex-1 bg-line-100" /> o <div className="h-px flex-1 bg-line-100" />
      </div>
      <a href={api.auth.githubUrl()} className="block">
        <Button variant="secondary" className="w-full">
          Continuar con GitHub
        </Button>
      </a>

      <p className="mt-6 text-center text-body-sm text-ink-500">
        ¿No tienes cuenta?{" "}
        <Link to="/register" className="font-medium text-blue-600 hover:underline">
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
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-50 px-4 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark size={28} />
        <Wordmark />
      </div>
      <Card className="w-full max-w-[420px]">
        <div className="mb-6">
          {eyebrow ? <Eyebrow className="mb-2 block">{eyebrow}</Eyebrow> : null}
          <h1 className="text-h3 text-ink-900">{title}</h1>
          <p className="mt-1.5 text-body-sm text-ink-500">{subtitle}</p>
        </div>
        {children}
      </Card>
    </div>
  );
}
