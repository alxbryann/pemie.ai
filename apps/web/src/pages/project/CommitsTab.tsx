import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DOMAIN_CONFIG, type DomainConfig } from "@pemie/shared";
import {
  api,
  ApiError,
  type Commit,
  type GithubUserRepo,
  type Repo,
  type Stats,
  type SyncResult,
} from "../../lib/api.js";
import { track } from "../../lib/analytics/index.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Input,
  Notice,
  Select,
  Skeleton,
  SkeletonStats,
  SkeletonList,
  Stat,
} from "../../components/ui.js";
import DomainConfigEditor from "./DomainConfigEditor.js";

const DATE_PRESETS = [
  { value: "", label: "Todo" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
];

function presetToSince(preset: string): string | undefined {
  if (!preset) return undefined;
  const days = Number(preset);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default function CommitsTab({ ws, proj }: { ws: string; proj: string }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [domainConfig, setDomainConfig] = useState<DomainConfig | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [contributorFilter, setContributorFilter] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sincronización manual con GitHub (usa el token OAuth de la sesión).
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Selector de repos de GitHub
  const [picker, setPicker] = useState(false);
  const [ghRepos, setGhRepos] = useState<GithubUserRepo[] | null>(null);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghNotConnected, setGhNotConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  const resolvedConfig = domainConfig ?? DEFAULT_DOMAIN_CONFIG;
  const labelByKey = useMemo(() => {
    const map = new Map(resolvedConfig.categories.map((c) => [c.key, c]));
    return map;
  }, [resolvedConfig]);

  /** Repos, stats y config de dominio — no depende de los filtros de commits. */
  async function load() {
    setError(null);
    try {
      const [r, s, p] = await Promise.all([
        api.repos.list(ws, proj),
        api.stats.get(ws, proj),
        api.projects.get(ws, proj),
      ]);
      setRepos(r.repos);
      setStats(s.stats);
      setDomainConfig(p.project.domainConfig);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando la ingesta");
    } finally {
      setLoading(false);
    }
  }

  // Contador de request: si el usuario cambia de filtro rápido, descarta
  // cualquier respuesta que no sea la del último pedido en vuelo.
  const commitsRequestId = useRef(0);
  /**
   * Lista de commits — separado de `load()` porque cambia con cada filtro sin
   * necesidad de re-pedir repos/stats. Acepta overrides explícitos para el
   * primer fetch en el efecto de montaje/cambio de proyecto: en ese momento
   * el estado de los filtros todavía no reflejó el reset (closure viejo), así
   * que no se puede confiar en leerlo directamente.
   */
  async function loadCommits(
    domain: string | null = domainFilter,
    contributorId: string | null = contributorFilter,
    preset: string = datePreset
  ) {
    const requestId = ++commitsRequestId.current;
    const since = presetToSince(preset);
    try {
      const { commits: c } = await api.commits.list(ws, proj, {
        limit: 50,
        ...(domain ? { domain } : {}),
        ...(contributorId ? { contributorId } : {}),
        ...(since ? { since } : {}),
      });
      if (requestId !== commitsRequestId.current) return; // respuesta obsoleta
      setCommits(c);
    } catch (e) {
      if (requestId !== commitsRequestId.current) return;
      setError(e instanceof ApiError ? e.message : "Error cargando los commits");
    }
  }

  // Abrir la pestaña sincroniza sola: primero se pinta lo que ya hay (rápido) y
  // en segundo plano se trae lo nuevo de GitHub. `autoSynced` evita repetirlo
  // en el doble montaje de StrictMode y al volver de un re-render.
  const autoSynced = useRef<string | null>(null);
  // Se arma en `false` cada vez que este efecto corre para que el efecto de
  // filtros (abajo) ignore el re-disparo que provoca el reset de filtros al
  // cambiar de proyecto — si no, se dispararía loadCommits() dos veces.
  const skipNextFiltersFetch = useRef(true);
  useEffect(() => {
    const key = `${ws}/${proj}`;
    skipNextFiltersFetch.current = true;
    setDomainFilter(null);
    setContributorFilter(null);
    setDatePreset("");
    load();
    loadCommits(null, null, "").then(() => {
      if (autoSynced.current === key) return;
      autoSynced.current = key;
      autoSync();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  // Refetch de commits cuando cambia cualquier filtro (no en el primer
  // disparo tras un reset de filtros — ese ya lo hace el efecto de arriba).
  useEffect(() => {
    if (skipNextFiltersFetch.current) {
      skipNextFiltersFetch.current = false;
      return;
    }
    void loadCommits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainFilter, contributorFilter, datePreset]);

  /**
   * Sincronización silenciosa al entrar: solo molesta si trajo algo o si falló.
   * Un "no había nada nuevo" en cada visita sería ruido.
   */
  async function autoSync() {
    setSyncing(true);
    try {
      const result = await api.repos.syncAll(ws, proj, "auto");
      if (result.ingested > 0 || result.failed.length > 0) {
        setSyncResult(result);
        await Promise.all([load(), loadCommits()]);
      }
    } catch {
      // Silencioso a propósito: la vista ya tiene datos y el usuario no pidió
      // esto. El botón manual sí reporta el error.
    } finally {
      setSyncing(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await api.repos.syncAll(ws, proj);
      setSyncResult(result);
      await Promise.all([load(), loadCommits()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo sincronizar con GitHub");
    } finally {
      setSyncing(false);
    }
  }

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
    setSyncResult(null);
    try {
      // El backend hace una primera sincronización al vincular.
      const { ingested, syncError } = await api.repos.link(ws, proj, {
        owner: r.owner,
        name: r.name,
        url: r.url,
      });
      setSyncResult({
        repos: 1,
        fetched: ingested,
        ingested,
        failed: syncError ? [{ repo: r.fullName, error: syncError }] : [],
      });
      await Promise.all([load(), loadCommits()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo vincular el repo");
    } finally {
      setLinking(null);
    }
  }

  async function unlink(id: string) {
    await api.repos
      .unlink(ws, proj, id)
      .then(() => Promise.all([load(), loadCommits()]))
      .catch(() => {});
  }

  function toggleDomainFilter(key: string) {
    setDomainFilter((current) => {
      const next = current === key ? null : key;
      if (next) track("commits_filter_applied", { filter_type: "domain" });
      return next;
    });
  }

  function domainBadge(key: string) {
    const cat = labelByKey.get(key);
    const label = cat ? `${cat.emoji ? `${cat.emoji} ` : ""}${cat.label}` : key;
    return label;
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

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonStats count={3} />
        <Card>
          <Skeleton className="mb-4 h-5 w-40" />
          <SkeletonList rows={5} />
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {syncResult && (
        <Notice
          tone={syncResult.failed.length > 0 ? "warning" : "success"}
          onDismiss={() => setSyncResult(null)}
        >
          {syncResult.ingested > 0
            ? `Se registraron ${syncResult.ingested} commits nuevos.`
            : syncResult.failed.length === syncResult.repos
              ? "No se pudo leer ningún repositorio."
              : "Todo al día: no había commits nuevos."}
          {syncResult.failed.length > 0 && (
            <ul className="mt-2 space-y-1">
              {syncResult.failed.map((f) => (
                <li key={f.repo}>
                  <span className="font-mono text-caption">{f.repo}</span>: {f.error}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

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
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDomainFilter(d.key)}
                  className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  aria-pressed={domainFilter === d.key}
                >
                  <Badge tone={domainFilter === d.key ? "brand" : "neutral"} mono>
                    {d.emoji ? `${d.emoji} ` : ""}
                    {d.label}: {d.count}
                  </Badge>
                </button>
              ))}
            </div>
            {domainFilter && (
              <button
                type="button"
                className="mt-2 text-caption text-ink-500 underline hover:text-ink-800"
                onClick={() => setDomainFilter(null)}
              >
                Quitar filtro
              </button>
            )}
          </Card>
        </div>
      )}

      <DomainConfigEditor
        key={`${ws}/${proj}`}
        ws={ws}
        proj={proj}
        initial={domainConfig}
        onSaved={(config) => {
          setDomainConfig(config);
          void load();
          void loadCommits();
        }}
      />

      {/* Repos vinculados */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-h4 text-ink-900">Repositorios vinculados</h3>
          <div className="flex items-center gap-2">
            {repos.length > 0 && (
              <Button variant="secondary" size="sm" onClick={sync} disabled={syncing}>
                {syncing ? "Sincronizando…" : "Sincronizar commits"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={openPicker}>
              + Vincular repo de GitHub
            </Button>
          </div>
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
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 -mx-6 px-6 py-3 hover:bg-surface-50"
                >
                  <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                    <a
                      href={r.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-body font-medium text-ink-900 hover:text-blue-600 hover:underline"
                    >
                      {r.owner}/{r.name}
                    </a>
                    <span className="shrink-0 font-mono text-caption text-ink-400">
                      {r._count.commits} commits
                    </span>
                  </div>
                  <Button variant="danger" size="sm" className="shrink-0" onClick={() => unlink(r.id)}>
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
              <SkeletonList rows={4} className="p-3" />
            ) : (
              <>
                <div className="border-b border-line-100 p-3">
                  <Input
                    autoFocus
                    placeholder="Buscar repo…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar repositorio"
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-h4 text-ink-900">Commits recientes</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={domainFilter ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                setDomainFilter(value);
                if (value) track("commits_filter_applied", { filter_type: "domain" });
              }}
              aria-label="Filtrar por tipo"
            >
              <option value="">Todos los tipos</option>
              {(stats?.byDomain ?? []).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.emoji ? `${d.emoji} ` : ""}
                  {d.label}
                </option>
              ))}
            </Select>
            <Select
              value={contributorFilter ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                setContributorFilter(value);
                // Nunca el nombre del autor en texto libre — solo el hecho de filtrar.
                if (value) track("commits_filter_applied", { filter_type: "author" });
              }}
              aria-label="Filtrar por autor"
            >
              <option value="">Todos los autores</option>
              {(stats?.byContributor ?? [])
                .filter((c) => c.contributor)
                .map((c) => (
                  <option key={c.contributor!.id} value={c.contributor!.id}>
                    {c.contributor!.name || c.contributor!.githubLogin}
                  </option>
                ))}
            </Select>
            <Select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                if (e.target.value) track("commits_filter_applied", { filter_type: "date_preset" });
              }}
              aria-label="Filtrar por fecha"
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            {(domainFilter || contributorFilter || datePreset) && (
              <button
                type="button"
                className="text-caption text-ink-500 underline hover:text-ink-800"
                onClick={() => {
                  setDomainFilter(null);
                  setContributorFilter(null);
                  setDatePreset("");
                  track("commits_filter_cleared");
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          {commits.length === 0 && syncing ? (
            <SkeletonList rows={5} />
          ) : commits.length === 0 ? (
            <EmptyState
              title="Sin commits todavía"
              description={
                domainFilter || contributorFilter || datePreset
                  ? "No hay commits que coincidan con estos filtros."
                  : repos.length === 0
                    ? "Vincula un repositorio de GitHub para empezar a ver la actividad del equipo."
                    : 'Pulsa "Sincronizar commits" para traer el historial con tu cuenta de GitHub.'
              }
            />
          ) : (
            <div className="divide-y divide-line-100">
              {commits.map((c) => (
                <div key={c.id} className="flex items-start gap-3 -mx-6 px-6 py-3 hover:bg-surface-50">
                  <Badge tone="neutral" mono>
                    {domainBadge(c.domain)}
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
