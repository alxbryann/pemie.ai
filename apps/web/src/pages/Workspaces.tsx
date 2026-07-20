import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type WorkspaceSummary } from "../lib/api.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "../components/ui.js";

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { workspaces } = await api.workspaces.list();
    setWorkspaces(workspaces);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.workspaces.create(name);
      setName("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  if (!workspaces) return <Spinner />;

  return (
    <div>
      <PageHeader
        eyebrow="Workspaces"
        title="Tus workspaces"
        description="Cada workspace agrupa proyectos y su equipo."
        actions={
          <Button onClick={() => setCreating((v) => !v)}>Nuevo workspace</Button>
        }
      />

      {creating && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="Nombre del workspace">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </Field>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Creando…" : "Crear"}
            </Button>
          </form>
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>
      )}

      {workspaces.length === 0 ? (
        <EmptyState
          title="Aún no tienes workspaces"
          description="Crea el primero para empezar a organizar tus proyectos y equipo."
          action={<Button onClick={() => setCreating(true)}>Crear workspace</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} to={`/w/${ws.slug}`}>
              <Card interactive>
                <div className="flex items-center justify-between">
                  <h2 className="text-body font-semibold text-ink-900">{ws.name}</h2>
                  <Badge tone="neutral" mono>{ws.role}</Badge>
                </div>
                <p className="mt-2 font-mono text-body-sm text-ink-400">
                  {ws.projectCount} {ws.projectCount === 1 ? "proyecto" : "proyectos"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
