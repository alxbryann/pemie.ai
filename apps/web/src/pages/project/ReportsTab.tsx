import { useEffect, useState } from "react";
import { api, ApiError, type Note, type Objective, type Report } from "../../lib/api.js";
import { Badge, Button, Card, ErrorText, Input, Spinner, Textarea } from "../../components/ui.js";

export default function ReportsTab({ ws, proj }: { ws: string; proj: string }) {
  const [objective, setObjective] = useState<Objective | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [objText, setObjText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  async function load() {
    setError(null);
    try {
      const [o, r, n] = await Promise.all([
        api.objective.get(ws, proj),
        api.reports.list(ws, proj),
        api.notes.list(ws, proj),
      ]);
      setObjective(o.objective);
      setObjText(o.objective?.description ?? "");
      setReports(r.reports);
      setNotes(n.notes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando informes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  async function saveObjective() {
    if (objText.trim().length < 3) return;
    try {
      const r = await api.objective.set(ws, proj, objText.trim());
      setObjective(r.objective);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el objetivo");
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      await api.notes.create(ws, proj, noteText.trim());
      setNoteText("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la nota");
    }
  }

  async function answerNote(id: string) {
    const resp = (answers[id] ?? "").trim();
    if (!resp) return;
    await api.notes.answer(ws, proj, id, resp).catch(() => {});
    setAnswers((a) => ({ ...a, [id]: "" }));
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {/* Objetivo */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Objetivo del proyecto</h3>
          {objective && (
            <span className="text-xs text-slate-400">
              actualizado {new Date(objective.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <Textarea
          className="mt-2"
          rows={2}
          value={objText}
          onChange={(e) => setObjText(e.target.value)}
          placeholder="¿Qué persigue este proyecto?"
        />
        <div className="mt-2">
          <Button onClick={saveObjective} disabled={objText.trim() === (objective?.description ?? "")}>
            Guardar objetivo
          </Button>
        </div>
      </Card>

      {/* Informes */}
      <Card>
        <h3 className="font-semibold">Informes de avance</h3>
        <div className="mt-3 space-y-2">
          {reports.length === 0 && (
            <p className="text-sm text-slate-400">
              Sin informes. Los publica un agente vía MCP (o manualmente por API).
            </p>
          )}
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <p className="text-sm font-medium">
                  {r.date} <Badge>{r.scope}</Badge>{" "}
                  {r.agent && <span className="text-xs text-slate-400">· {r.agent.name}</span>}
                </p>
                {r.verdict && <p className="text-sm text-slate-600">{r.verdict}</p>}
              </div>
              {r.score != null && (
                <span className="text-lg font-bold text-brand">{Math.round(r.score)}</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Notas */}
      <Card>
        <h3 className="font-semibold">Notas</h3>
        <form onSubmit={addNote} className="mt-3 flex gap-2">
          <Input
            placeholder="Escribe una nota o pregunta…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <Button type="submit">Agregar</Button>
        </form>
        <div className="mt-3 space-y-3">
          {notes.length === 0 && <p className="text-sm text-slate-400">Sin notas.</p>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">{n.message}</p>
                <Badge>{n.status === "processed" ? "respondida" : "pendiente"}</Badge>
              </div>
              {n.response ? (
                <p className="mt-2 border-l-2 border-brand/40 pl-2 text-sm text-slate-600">
                  {n.response}
                </p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Responder…"
                    value={answers[n.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [n.id]: e.target.value }))}
                  />
                  <Button variant="ghost" onClick={() => answerNote(n.id)}>
                    Responder
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
