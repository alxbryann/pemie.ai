import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type WorkspaceSummary } from "../lib/api.js";
import { Badge, Button, Card, ErrorText, Field, Input, Spinner } from "../components/ui.js";

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tus workspaces</h1>
          <p className="text-sm text-slate-500">Cada workspace agrupa proyectos y su equipo.</p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>Nuevo workspace</Button>
      </div>

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
        <Card className="text-center text-slate-500">
          Aún no tienes workspaces. Crea el primero para empezar.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} to={`/w/${ws.slug}`}>
              <Card className="transition hover:border-brand hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{ws.name}</h2>
                  <Badge>{ws.role}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
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
