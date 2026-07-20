import { useEffect, useState } from "react";
import { api, ApiError, type Board } from "../../lib/api.js";
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from "../../components/ui.js";

const TYPE_EMOJI: Record<string, string> = { story: "📗", task: "✅", bug: "🐛" };

export default function BoardTab({ ws, proj }: { ws: string; proj: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("task");

  async function load() {
    setError(null);
    try {
      const r = await api.board.get(ws, proj);
      setBoard(r.board);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando el tablero");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 1) return;
    try {
      await api.board.createCard(ws, proj, { title: title.trim(), type });
      setTitle("");
      setType("task");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la tarjeta");
    }
  }

  async function moveCard(id: string, columnId: string) {
    await api.board.moveCard(ws, proj, id, columnId).catch(() => {});
    await load();
  }

  if (loading) return <Spinner />;
  if (!board) return <ErrorText>No se pudo cargar el tablero.</ErrorText>;

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>

      {/* Nueva tarjeta */}
      <Card>
        <form onSubmit={addCard} className="flex flex-wrap items-end gap-2">
          <Input
            placeholder="Nueva tarjeta…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-sm"
          />
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="task">task</option>
            <option value="story">story</option>
            <option value="bug">bug</option>
          </Select>
          <Button type="submit">Añadir a {board.columns[0]?.name}</Button>
        </form>
      </Card>

      {/* Columnas */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {board.columns.map((col) => (
          <div key={col.id} className="w-64 shrink-0 rounded-xl bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">{col.name}</h4>
              <span className="text-xs text-slate-400">{col.cards.length}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map((card) => (
                <div key={card.id} className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-sm">
                    <span className="mr-1">{TYPE_EMOJI[card.type] ?? "•"}</span>
                    {card.title}
                  </p>
                  {card.userStory && (
                    <p className="mt-1">
                      <Badge>{card.userStory.key}</Badge>
                    </p>
                  )}
                  <Select
                    className="mt-2 w-full !py-1 text-xs"
                    value={col.id}
                    onChange={(e) => moveCard(card.id, e.target.value)}
                  >
                    {board.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        → {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
              {col.cards.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-300">vacío</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
