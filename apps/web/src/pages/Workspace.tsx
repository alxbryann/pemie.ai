import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Role } from "@pemie/shared";
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
  DangerZone,
  EmptyState,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  type BadgeTone,
} from "../components/ui.js";

/** Roles asignables desde el selector de la fila (no hay flujo de transferencia de owner). */
const ASSIGNABLE_ROLES: Role[] = ["viewer", "member", "admin"];

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

  if (error)
    return (
      <Card>
        <ErrorText>{error}</ErrorText>
      </Card>
    );
  if (!ws) return <WorkspaceSkeleton />;

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
        {/* `key` por workspace: al cambiar de workspace se descarta el borrador de
            nombre y el texto de confirmación del anterior. */}
        {canManage && <SettingsSection key={ws.id} ws={ws} onRenamed={setWs} />}
      </div>
    </div>
  );
}

/** Skeleton con la forma final de la página: cabecera, proyectos y equipo. */
function WorkspaceSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-3 w-24" />
      <div className="mb-8 flex items-end justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
      <div className="space-y-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-36 rounded-sm" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </section>
        <section>
          <Skeleton className="mb-4 h-6 w-24" />
          <Card>
            <SkeletonList rows={3} />
          </Card>
        </section>
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

/**
 * Gestión del propio workspace: renombrar (admin/owner) y eliminar (solo owner).
 * Vive en el detalle y no en la lista porque son acciones sobre *este* workspace
 * y el borrado necesita espacio para una confirmación seria.
 */
function SettingsSection({ ws, onRenamed }: { ws: Ws; onRenamed: (workspace: Ws) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(ws.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canRename = trimmed.length >= 2 && trimmed !== ws.name && !saving;
  // Escribir el nombre exacto es la barrera contra el borrado por inercia.
  const canDelete = confirmation.trim() === ws.name && !deleting;

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (!canRename) return;
    setSaving(true);
    setRenameError(null);
    try {
      const { workspace } = await api.workspaces.update(ws.slug, trimmed);
      onRenamed(workspace); // el estado de la página se refresca sin recargar
      setSaved(true);
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : "No se pudo renombrar el workspace");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.workspaces.remove(ws.slug);
      // La ruta actual deja de existir: se vuelve a la lista sin dejarla en el historial.
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar el workspace");
      setDeleting(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-h3 text-ink-900">Ajustes</h2>
      <div className="space-y-4">
        <Card>
          <form onSubmit={onRename} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <Field
                label="Nombre del workspace"
                hint={`La dirección no cambia: /w/${ws.slug} sigue funcionando.`}
              >
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                  minLength={2}
                  required
                />
              </Field>
            </div>
            <Button type="submit" disabled={!canRename}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </form>
          <div className="mt-2">
            <ErrorText>{renameError}</ErrorText>
            {saved && !renameError ? (
              <p className="text-body-sm text-ink-500">Nombre actualizado.</p>
            ) : null}
          </div>
        </Card>

        {ws.role === "owner" && (
          <DangerZone
            title="Eliminar workspace"
            description={
              <>
                <p>
                  Se borrarán de forma permanente los proyectos de este workspace y todo su
                  contenido: repositorios y commits, informes y notas, épicas e historias de
                  usuario, tableros, las API keys y el registro de auditoría. El equipo perderá
                  el acceso.
                </p>
                <p className="mt-2 font-semibold text-ink-800">Esta acción no se puede deshacer.</p>
              </>
            }
          >
            <form onSubmit={onDelete} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <Field label={`Escribe «${ws.name}» para confirmar`}>
                  <Input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder={ws.name}
                    autoComplete="off"
                    aria-label={`Escribe ${ws.name} para confirmar la eliminación`}
                  />
                </Field>
              </div>
              <Button type="submit" variant="danger" disabled={!canDelete}>
                {deleting ? "Eliminando…" : "Eliminar workspace"}
              </Button>
            </form>
            <div className="mt-2">
              <ErrorText>{deleteError}</ErrorText>
            </div>
          </DangerZone>
        )}
      </div>
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
  const [lastInvite, setLastInvite] = useState<Invitation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});

  function inviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  async function copyLink(id: string, token: string) {
    await navigator.clipboard?.writeText(inviteLink(token)).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1400);
  }

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
      const res = await api.workspaces.invite(slug, email);
      setLastInvite(res.invitation);
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

  async function onRoleChange(membershipId: string, role: Role) {
    setRoleBusyId(membershipId);
    setRoleErrors((prev) => ({ ...prev, [membershipId]: "" }));
    try {
      const { member } = await api.workspaces.updateMemberRole(slug, membershipId, role);
      // Reemplaza solo la fila afectada: evita un refetch completo de la lista.
      setMembers((prev) => prev.map((m) => (m.membershipId === membershipId ? member : m)));
    } catch (err) {
      setRoleErrors((prev) => ({
        ...prev,
        [membershipId]: err instanceof ApiError ? err.message : "No se pudo cambiar el rol",
      }));
    } finally {
      setRoleBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-h3 text-ink-900">Equipo</h2>
      <Card>
        <ul className="divide-y divide-line-100">
          {members.map((m) => {
            const editable = canManage && m.role !== "owner";
            return (
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
                {editable ? (
                  <div className="flex flex-none flex-col items-end gap-1">
                    <Select
                      aria-label={`Rol de ${m.user.name ?? m.user.email}`}
                      value={m.role}
                      disabled={roleBusyId === m.membershipId}
                      onChange={(e) => onRoleChange(m.membershipId, e.target.value as Role)}
                      className="w-auto py-1.5 font-mono text-caption"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                    {roleErrors[m.membershipId] ? (
                      <ErrorText>{roleErrors[m.membershipId]}</ErrorText>
                    ) : null}
                  </div>
                ) : (
                  <Badge tone="neutral" mono>{m.role}</Badge>
                )}
              </li>
            );
          })}
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

          {lastInvite && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-body-sm text-ink-700">
                {lastInvite.emailDelivered
                  ? `Invitación enviada por correo a ${lastInvite.email}.`
                  : lastInvite.emailPreviewUrl
                    ? `Invitación enviada al buzón de prueba (Ethereal). No llega al inbox real de ${lastInvite.email}, pero puedes ver el correo aquí:`
                    : `Invitación creada — comparte este enlace con ${lastInvite.email}:`}
              </p>
              {lastInvite.emailPreviewUrl && (
                <a
                  href={lastInvite.emailPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-body-sm font-medium text-blue-600 underline"
                >
                  Ver correo enviado →
                </a>
              )}
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-caption text-ink-700">
                  {inviteLink(lastInvite.token)}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyLink(lastInvite.id, lastInvite.token)}
                >
                  {copiedId === lastInvite.id ? "copiado" : "copiar link"}
                </Button>
              </div>
            </div>
          )}

          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-line-100 border-t border-line-100 pt-3">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink-900">
                    {inv.email}
                  </span>
                  <Badge tone={invStatusTone(inv.status)} dot>{inv.status}</Badge>
                  <Badge tone="neutral" mono>{inv.role}</Badge>
                  {inv.status === "pending" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyLink(inv.id, inv.token)}
                    >
                      {copiedId === inv.id ? "copiado" : "copiar link"}
                    </Button>
                  )}
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
