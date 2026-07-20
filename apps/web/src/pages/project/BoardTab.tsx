import { useEffect, useState } from "react";
import { api, ApiError, type Board } from "../../lib/api.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Input,
  Select,
  Spinner,
} from "../../components/ui.js";

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
            aria-label="Nueva tarjeta"
          />
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Tipo de tarjeta"
          >
            <option value="task">task</option>
            <option value="story">story</option>
            <option value="bug">bug</option>
          </Select>
          <Button type="submit">Añadir a {board.columns[0]?.name}</Button>
        </form>
      </Card>

      {/* Columnas */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {board.columns.map((col) => (
          <div
            key={col.id}
            className="w-64 shrink-0 rounded-xl border border-line-100 bg-surface-50 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-body-sm font-semibold text-ink-900">{col.name}</h4>
              <span className="font-mono text-mono-label text-ink-400">{col.cards.length}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map((card) => (
                <Card key={card.id} padding="sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-body-sm text-ink-900">{card.title}</p>
                    <Badge tone="neutral" mono>
                      {card.type}
                    </Badge>
                  </div>
                  {card.userStory && (
                    <p className="mt-1.5">
                      <Badge tone="brand" mono>
                        {card.userStory.key}
                      </Badge>
                    </p>
                  )}
                  <Select
                    className="mt-2 w-full"
                    value={col.id}
                    onChange={(e) => moveCard(card.id, e.target.value)}
                  >
                    {board.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Card>
              ))}
              {col.cards.length === 0 && <EmptyState compact title="Sin tarjetas" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
