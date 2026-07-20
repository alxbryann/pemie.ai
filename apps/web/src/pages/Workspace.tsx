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
  type BadgeTone,
} from "../components/ui.js";

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
    <div>
      <Link to="/" className="mb-1 block text-body-sm text-ink-400 hover:text-ink-700">
        ← workspaces
      </Link>
      <PageHeader
        title={ws.name}
        actions={<Badge tone="neutral" mono>{ws.role}</Badge>}
      />

      <div className="space-y-8">
        <ProjectsSection slug={slug} projects={projects} onChange={loadCore} />
        <TeamSection slug={slug} canManage={canManage} />
      </div>
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h3 text-ink-900">Proyectos</h2>
        <Button variant="secondary" size="sm" onClick={() => setCreating((v) => !v)}>
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
        <EmptyState
          title="Aún no hay proyectos"
          description="Crea el primero para empezar a rastrear commits e historias de usuario."
          action={
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              Crear proyecto
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} to={`/w/${slug}/p/${p.slug}`}>
              <Card interactive>
                <div className="flex items-center justify-between">
                  <h3 className="text-body font-semibold text-ink-900">{p.name}</h3>
                  <Badge tone="neutral" mono>{p.key}</Badge>
                </div>
                {p.description && (
                  <p className="mt-2 line-clamp-2 text-body-sm text-ink-500">{p.description}</p>
                )}
                <p className="mt-2 font-mono text-body-sm text-ink-400">
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

function invStatusTone(status: string): BadgeTone {
  if (status === "accepted") return "success";
  if (status === "expired") return "danger";
  return "warning";
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
      <h2 className="mb-4 text-h3 text-ink-900">Equipo</h2>
      <Card>
        <ul className="divide-y divide-line-100">
          {members.map((m) => (
            <li
              key={m.membershipId}
              className="-mx-6 flex items-center gap-3 px-6 py-2.5 first:pt-0 last:pb-0 hover:bg-surface-50"
            >
              <div className="grid h-8 w-8 flex-none place-items-center rounded-pill bg-surface-100 text-caption font-semibold text-ink-700">
                {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-ink-900">
                  {m.user.name ?? m.user.email}
                </p>
                <p className="truncate font-mono text-caption text-ink-400">{m.user.email}</p>
              </div>
              <Badge tone="neutral" mono>{m.role}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card className="mt-4">
          <h3 className="mb-3 text-body-sm font-semibold text-ink-600">Invitar por email</h3>
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
            <ul className="mt-4 divide-y divide-line-100 border-t border-line-100 pt-3">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink-900">
                    {inv.email}
                  </span>
                  <Badge tone={invStatusTone(inv.status)} dot>{inv.status}</Badge>
                  <Badge tone="neutral" mono>{inv.role}</Badge>
                  <Button variant="danger" size="sm" onClick={() => onRevoke(inv.id)}>
                    revocar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}
