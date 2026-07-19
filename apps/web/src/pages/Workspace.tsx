import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type Workspace as Ws,
  type ProjectSummary,
  type Member,
  type Invitation,
} from "../lib/api.js";
import { Badge, Button, Card, ErrorText, Field, Input, Spinner } from "../components/ui.js";

export default function Workspace() {
  const { slug = "" } = useParams();
  const [ws, setWs] = useState<Ws | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadCore() {
    const [{ workspace }, { projects }] = await Promise.all([
      api.workspaces.get(slug),
      api.projects.list(slug),
    ]);
    setWs(workspace);
    setProjects(projects);
  }

  useEffect(() => {
    loadCore().catch((e) =>
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el workspace")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) return <Card className="text-red-600">{error}</Card>;
  if (!ws) return <Spinner />;

  const canManage = ws.role === "owner" || ws.role === "admin";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-slate-400 hover:underline">
            ← workspaces
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{ws.name}</h1>
        </div>
        <Badge>{ws.role}</Badge>
      </div>

      <ProjectsSection slug={slug} projects={projects} onChange={loadCore} />

      <TeamSection slug={slug} canManage={canManage} />
    </div>
  );
}

function ProjectsSection({
  slug,
  projects,
  onChange,
}: {
  slug: string;
  projects: ProjectSummary[];
  onChange: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.projects.create(slug, { name, key: key || undefined });
      setName("");
      setKey("");
      setCreating(false);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el proyecto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Proyectos</h2>
        <Button variant="ghost" onClick={() => setCreating((v) => !v)}>
          Nuevo proyecto
        </Button>
      </div>

      {creating && (
        <Card className="mb-4">
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Field label="Nombre">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Key">
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="PRJ"
                  maxLength={6}
                />
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

      {projects.length === 0 ? (
        <Card className="text-center text-slate-500">Aún no hay proyectos en este workspace.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} to={`/w/${slug}/p/${p.slug}`}>
              <Card className="transition hover:border-brand hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  <Badge>{p.key}</Badge>
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {p._count.repos} repos · {p._count.userStories} HUs
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamSection({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const membersRes = await api.workspaces.members(slug);
    setMembers(membersRes.members);
    if (canManage) {
      const invRes = await api.workspaces.invitations(slug);
      setInvitations(invRes.invitations);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, canManage]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.workspaces.invite(slug, email);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo invitar");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    await api.workspaces.revokeInvite(slug, id).catch(() => {});
    await load();
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Equipo</h2>
      <Card>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.membershipId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.user.name ?? m.user.email}</p>
                <p className="truncate text-xs text-slate-400">{m.user.email}</p>
              </div>
              <span className="ml-auto">
                <Badge>{m.role}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card className="mt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-600">Invitar por email</h3>
          <form onSubmit={onInvite} className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@empresa.com"
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Invitando…" : "Invitar"}
            </Button>
          </form>
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>

          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="truncate">{inv.email}</span>
                  <Badge>{inv.role}</Badge>
                  <button
                    onClick={() => onRevoke(inv.id)}
                    className="ml-auto text-xs text-red-500 hover:underline"
                  >
                    revocar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}
