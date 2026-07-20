import { useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  type Commit,
  type GithubUserRepo,
  type Repo,
  type Stats,
} from "../../lib/api.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Input,
  Spinner,
  Stat,
} from "../../components/ui.js";

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
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <Stat value={stats.totalCommits} label="Commits totales" />
          </Card>
          <Card>
            <Stat value={stats.repoCount} label="Repositorios" />
          </Card>
          <Card>
            <p className="text-caption font-mono uppercase text-ink-500">Por dominio</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stats.byDomain.length === 0 && (
                <span className="text-body-sm text-ink-400">—</span>
              )}
              {stats.byDomain.map((d) => (
                <Badge key={d.key} tone="neutral" mono>
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
          <h3 className="text-h4 text-ink-900">Repositorios vinculados</h3>
          <Button variant="secondary" size="sm" onClick={openPicker}>
            + Vincular repo de GitHub
          </Button>
        </div>
        <div className="mt-4">
          {repos.length === 0 ? (
            <EmptyState
              title="Sin repositorios"
              description='Pulsa "Vincular repo de GitHub" y elige de tu lista.'
            />
          ) : (
            <div className="divide-y divide-line-100">
              {repos.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3 hover:bg-surface-50">
                  <div>
                    <a
                      href={r.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="text-body font-medium text-ink-900 hover:text-blue-600 hover:underline"
                    >
                      {r.owner}/{r.name}
                    </a>
                    <span className="ml-2 font-mono text-caption text-ink-400">
                      {r._count.commits} commits
                    </span>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => unlink(r.id)}>
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Selector de repos de GitHub */}
      {picker && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
          onClick={() => setPicker(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-line-200 bg-surface-0 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-100 p-4">
              <h3 className="text-h4 text-ink-900">Tus repositorios de GitHub</h3>
              <button
                className="text-body text-ink-400 transition-colors hover:text-ink-900"
                onClick={() => setPicker(false)}
              >
                Cerrar
              </button>
            </div>

            {ghNotConnected ? (
              <div className="p-6 text-center">
                <p className="text-body-sm text-ink-600">
                  Conéctate con GitHub para ver y elegir tus repositorios.
                </p>
                <a href={api.auth.githubUrl()}>
                  <Button className="mt-4">Conectar con GitHub</Button>
                </a>
              </div>
            ) : ghLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="border-b border-line-100 p-3">
                  <Input
                    autoFocus
                    placeholder="Buscar repo…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-[55vh] divide-y divide-line-100 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="p-4 text-body-sm text-ink-400">No hay repos que coincidan.</p>
                  )}
                  {filtered.map((r) => {
                    const already = linkedKeys.has(r.fullName.toLowerCase());
                    return (
                      <div
                        key={r.fullName}
                        className="flex items-center justify-between gap-3 p-3 hover:bg-surface-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-body font-medium text-ink-900">
                            {r.fullName}{" "}
                            {r.private && (
                              <Badge tone="neutral" mono>
                                privado
                              </Badge>
                            )}
                          </p>
                          {r.description && (
                            <p className="truncate text-body-sm text-ink-400">{r.description}</p>
                          )}
                        </div>
                        {already ? (
                          <Badge tone="success" dot>
                            vinculado
                          </Badge>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
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
        <h3 className="text-h4 text-ink-900">Commits recientes</h3>
        <div className="mt-4">
          {commits.length === 0 ? (
            <EmptyState
              title="Sin commits todavía"
              description="Vincula un repo; los commits llegan por webhook de la GitHub App (o con backfill)."
            />
          ) : (
            <div className="divide-y divide-line-100">
              {commits.map((c) => (
                <div key={c.id} className="flex items-start gap-3 py-3 hover:bg-surface-50">
                  <Badge tone="neutral" mono>
                    {c.domain}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink-900">{c.message.split("\n")[0]}</p>
                    <p className="mt-0.5 font-mono text-caption text-ink-400">
                      {c.contributor.githubLogin} · {c.repo.owner}/{c.repo.name} ·{" "}
                      {new Date(c.committedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <code className="font-mono text-caption text-ink-400">{c.sha.slice(0, 7)}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
