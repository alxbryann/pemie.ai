import { useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  type Commit,
  type GithubUserRepo,
  type Repo,
  type Stats,
} from "../../lib/api.js";
import { Badge, Button, Card, ErrorText, Input, Spinner } from "../../components/ui.js";

export default function CommitsTab({ ws, proj }: { ws: string; proj: string }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selector de repos de GitHub
  const [picker, setPicker] = useState(false);
  const [ghRepos, setGhRepos] = useState<GithubUserRepo[] | null>(null);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghNotConnected, setGhNotConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [r, c, s] = await Promise.all([
        api.repos.list(ws, proj),
        api.commits.list(ws, proj, { limit: 50 }),
        api.stats.get(ws, proj),
      ]);
      setRepos(r.repos);
      setCommits(c.commits);
      setStats(s.stats);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando la ingesta");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  async function openPicker() {
    setPicker(true);
    if (ghRepos || ghLoading) return;
    setGhLoading(true);
    setGhNotConnected(false);
    try {
      const r = await api.auth.githubRepos();
      setGhRepos(r.repos);
    } catch (e) {
      if (e instanceof ApiError && e.code === "github_not_connected") setGhNotConnected(true);
      else setError(e instanceof ApiError ? e.message : "No se pudieron cargar tus repos");
    } finally {
      setGhLoading(false);
    }
  }

  async function linkFromGithub(r: GithubUserRepo) {
    setLinking(r.fullName);
    setError(null);
    try {
      await api.repos.link(ws, proj, { owner: r.owner, name: r.name, url: r.url });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo vincular el repo");
    } finally {
      setLinking(null);
    }
  }

  async function unlink(id: string) {
    await api.repos.unlink(ws, proj, id).then(load).catch(() => {});
  }

  const linkedKeys = useMemo(
    () => new Set(repos.map((r) => `${r.owner}/${r.name}`.toLowerCase())),
    [repos]
  );
  const filtered = useMemo(() => {
    if (!ghRepos) return [];
    const q = query.trim().toLowerCase();
    return q ? ghRepos.filter((r) => r.fullName.toLowerCase().includes(q)) : ghRepos;
  }, [ghRepos, query]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {/* Stats */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-xs text-slate-400">Commits</p>
            <p className="text-2xl font-bold">{stats.totalCommits}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Repos</p>
            <p className="text-2xl font-bold">{stats.repoCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Por dominio</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {stats.byDomain.length === 0 && <span className="text-sm text-slate-400">—</span>}
              {stats.byDomain.map((d) => (
                <Badge key={d.key}>
                  {d.emoji ? `${d.emoji} ` : ""}
                  {d.label}: {d.count}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Repos vinculados */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Repositorios vinculados</h3>
          <Button onClick={openPicker}>+ Vincular repo de GitHub</Button>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {repos.length === 0 && (
            <p className="py-2 text-sm text-slate-400">
              Aún no hay repos. Pulsa “Vincular repo de GitHub” y elige de tu lista.
            </p>
          )}
          {repos.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2">
              <div className="text-sm">
                <a
                  href={r.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {r.owner}/{r.name}
                </a>
                <span className="ml-2 text-slate-400">{r._count.commits} commits</span>
              </div>
              <Button variant="danger" onClick={() => unlink(r.id)} className="!px-2 !py-1 text-xs">
                Quitar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Selector de repos de GitHub */}
      {picker && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
          onClick={() => setPicker(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="font-semibold">Tus repositorios de GitHub</h3>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setPicker(false)}>
                ✕
              </button>
            </div>

            {ghNotConnected ? (
              <div className="p-6 text-center">
                <p className="text-sm text-slate-600">
                  Conéctate con GitHub para ver y elegir tus repositorios.
                </p>
                <a href={api.auth.githubUrl()}>
                  <Button className="mt-3">Conectar con GitHub</Button>
                </a>
              </div>
            ) : ghLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="border-b border-slate-100 p-3">
                  <Input
                    autoFocus
                    placeholder="Buscar repo…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="p-4 text-sm text-slate-400">No hay repos que coincidan.</p>
                  )}
                  {filtered.map((r) => {
                    const already = linkedKeys.has(r.fullName.toLowerCase());
                    return (
                      <div key={r.fullName} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {r.fullName}{" "}
                            {r.private && <Badge>privado</Badge>}
                          </p>
                          {r.description && (
                            <p className="truncate text-xs text-slate-400">{r.description}</p>
                          )}
                        </div>
                        {already ? (
                          <span className="shrink-0 text-xs text-slate-400">vinculado ✓</span>
                        ) : (
                          <Button
                            variant="ghost"
                            className="!px-3 !py-1 text-xs"
                            disabled={linking === r.fullName}
                            onClick={() => linkFromGithub(r)}
                          >
                            {linking === r.fullName ? "…" : "Vincular"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Commits */}
      <Card>
        <h3 className="font-semibold">Commits recientes</h3>
        <div className="mt-3 space-y-2">
          {commits.length === 0 && (
            <p className="text-sm text-slate-400">
              Sin commits todavía. Vincula un repo; los commits llegan por webhook de la GitHub App (o
              con backfill).
            </p>
          )}
          {commits.map((c) => (
            <div key={c.id} className="flex items-start gap-3 border-b border-slate-100 pb-2">
              <Badge>{c.domain}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{c.message.split("\n")[0]}</p>
                <p className="text-xs text-slate-400">
                  {c.contributor.githubLogin} · {c.repo.owner}/{c.repo.name} ·{" "}
                  {new Date(c.committedAt).toLocaleDateString()}
                </p>
              </div>
              <code className="text-xs text-slate-400">{c.sha.slice(0, 7)}</code>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
