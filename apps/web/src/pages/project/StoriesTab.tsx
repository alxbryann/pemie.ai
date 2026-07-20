import { useEffect, useState } from "react";
import { api, ApiError, type Epic, type UserStory } from "../../lib/api.js";
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from "../../components/ui.js";

const STATUSES = ["backlog", "ready", "in_progress", "review", "done"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const PRIORITY_COLOR: Record<string, string> = {
  low: "text-slate-500",
  medium: "text-blue-600",
  high: "text-amber-600",
  critical: "text-red-600",
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
        <h3 className="font-semibold">Nueva Historia de Usuario</h3>
        <form onSubmit={createStory} className="mt-3 space-y-2">
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
            <Input placeholder="Como… (rol)" value={role} onChange={(e) => setRole(e.target.value)} />
            <Input placeholder="quiero… (want)" value={want} onChange={(e) => setWant(e.target.value)} />
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
        <h3 className="font-semibold">Historias ({stories.length})</h3>
        <div className="mt-3 space-y-2">
          {stories.length === 0 && <p className="text-sm text-slate-400">Aún no hay historias.</p>}
          {stories.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <div className="min-w-0">
                <p className="text-sm">
                  <Badge>{s.key}</Badge> <span className="font-medium">{s.title}</span>
                </p>
                {s.narrative?.role && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Como {s.narrative.role}, quiero {s.narrative.want} para {s.narrative.benefit}
                  </p>
                )}
                <span className={`text-xs font-medium ${PRIORITY_COLOR[s.priority] ?? ""}`}>
                  {s.priority}
                </span>
              </div>
              <Select value={s.status} onChange={(e) => setStatus(s.id, e.target.value)}>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </Card>

      {epics.length > 0 && (
        <Card>
          <h3 className="font-semibold">Épicas</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {epics.map((e) => (
              <Badge key={e.id}>
                {e.title} · {e._count.stories}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
