import { useEffect, useState } from "react";
import { api, ApiError, type Epic, type UserStory } from "../../lib/api.js";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Input,
  Select,
  Spinner,
} from "../../components/ui.js";

const STATUSES = ["backlog", "ready", "in_progress", "review", "done"];
const PRIORITIES = ["low", "medium", "high", "critical"];

const STATUS_TONE: Record<string, BadgeTone> = {
  backlog: "neutral",
  ready: "brand",
  in_progress: "brand",
  review: "warning",
  done: "success",
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: "neutral",
  medium: "brand",
  high: "warning",
  critical: "danger",
};

export default function StoriesTab({ ws, proj }: { ws: string; proj: string }) {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [role, setRole] = useState("");
  const [want, setWant] = useState("");
  const [benefit, setBenefit] = useState("");

  async function load() {
    setError(null);
    try {
      const [s, e] = await Promise.all([api.stories.list(ws, proj), api.epics.list(ws, proj)]);
      setStories(s.userStories);
      setEpics(e.epics);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando historias");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  async function createStory(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) return;
    try {
      await api.stories.create(ws, proj, {
        title: title.trim(),
        priority,
        narrative:
          role || want || benefit ? { role, want, benefit } : undefined,
      });
      setTitle("");
      setRole("");
      setWant("");
      setBenefit("");
      setPriority("medium");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la HU");
    }
  }

  async function setStatus(id: string, status: string) {
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    await api.stories.update(ws, proj, id, { status }).catch(() => load());
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {/* Nueva HU */}
      <Card>
        <h3 className="text-h4 text-ink-900">Nueva historia de usuario</h3>
        <form onSubmit={createStory} className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Título (ej: Login con GitHub)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Button type="submit">Crear</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Como… (rol)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <Input
              placeholder="quiero… (want)"
              value={want}
              onChange={(e) => setWant(e.target.value)}
            />
            <Input
              placeholder="para… (beneficio)"
              value={benefit}
              onChange={(e) => setBenefit(e.target.value)}
            />
          </div>
        </form>
      </Card>

      {/* Lista */}
      <Card>
        <h3 className="text-h4 text-ink-900">Historias ({stories.length})</h3>
        <div className="mt-4">
          {stories.length === 0 ? (
            <EmptyState
              title="Aún no hay historias"
              description="Crea la primera historia de usuario para comenzar a organizar el trabajo."
            />
          ) : (
            <div className="divide-y divide-line-100">
              {stories.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-3 py-3 hover:bg-surface-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand" mono>
                        {s.key}
                      </Badge>
                      <span className="text-body font-medium text-ink-900">{s.title}</span>
                    </div>
                    {s.narrative?.role && (
                      <p className="mt-1 text-body-sm text-ink-500">
                        Como {s.narrative.role}, quiero {s.narrative.want} para{" "}
                        {s.narrative.benefit}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <Badge tone={PRIORITY_TONE[s.priority] ?? "neutral"} mono>
                        {s.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"} dot>
                      {s.status}
                    </Badge>
                    <Select
                      value={s.status}
                      onChange={(e) => setStatus(s.id, e.target.value)}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {epics.length > 0 && (
        <Card>
          <h3 className="text-h4 text-ink-900">Épicas</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {epics.map((e) => (
              <Badge key={e.id} tone="brand">
                {e.title} · {e._count.stories}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
