import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError, type Board, type Card as CardData, type Column } from "../../lib/api.js";
import {
  Badge,
  Button,
  Card,
  DragHandle,
  EmptyState,
  ErrorText,
  Input,
  Select,
  SkeletonBoard,
} from "../../components/ui.js";
import CardDetailModal from "./CardDetailModal.js";

/** Columna que contiene la tarjeta, o el id de la propia columna si se soltó en un hueco vacío. */
function findContainer(board: Board, id: string): string | undefined {
  if (board.columns.some((c) => c.id === id)) return id;
  return board.columns.find((c) => c.cards.some((card) => card.id === id))?.id;
}

function cardLabel(board: Board, id: string) {
  return board.columns.flatMap((c) => c.cards).find((c) => c.id === id)?.title ?? id;
}

function columnLabel(board: Board, id: string) {
  return board.columns.find((c) => c.id === id)?.name ?? id;
}

function announcements(board: Board): Announcements {
  return {
    onDragStart: ({ active }) => `Levantaste la tarjeta "${cardLabel(board, String(active.id))}".`,
    onDragOver: ({ active, over }) =>
      over
        ? `Tarjeta "${cardLabel(board, String(active.id))}" sobre la columna "${columnLabel(
            board,
            findContainer(board, String(over.id)) ?? String(over.id)
          )}".`
        : `Tarjeta "${cardLabel(board, String(active.id))}" fuera de cualquier columna.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Tarjeta "${cardLabel(board, String(active.id))}" soltada en la columna "${columnLabel(
            board,
            findContainer(board, String(over.id)) ?? String(over.id)
          )}".`
        : `Se canceló el movimiento de "${cardLabel(board, String(active.id))}".`,
    onDragCancel: ({ active }) => `Se canceló el movimiento de "${cardLabel(board, String(active.id))}".`,
  };
}

function CardBody({ card }: { card: CardData }) {
  return (
    <>
      <p className="text-body-sm text-ink-900">{card.title}</p>
      <Badge tone="neutral" mono>
        {card.type}
      </Badge>
      {card.userStory ? (
        <p className="mt-1.5 basis-full">
          <Badge tone="brand" mono>
            {card.userStory.key}
          </Badge>
        </p>
      ) : (
        card.type === "story" && (
          <p className="mt-1.5 basis-full">
            <Badge tone="neutral" mono>
              Historia eliminada
            </Badge>
          </p>
        )
      )}
      {card.assignee && (
        <p className="mt-1.5 flex basis-full items-center gap-1.5 text-caption text-ink-500">
          {card.assignee.avatarUrl ? (
            <img
              src={card.assignee.avatarUrl}
              alt=""
              className="h-4 w-4 rounded-full"
            />
          ) : null}
          <span className="font-mono">{card.assignee.githubLogin}</span>
        </p>
      )}
    </>
  );
}

/** Vista flotante que sigue al puntero mientras se arrastra (dnd-kit `DragOverlay`). */
function CardPreview({ card }: { card: CardData }) {
  return (
    <Card padding="sm" className="w-64 rotate-2 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardBody card={card} />
      </div>
    </Card>
  );
}

function SortableCard({
  card,
  columns,
  onMoveViaSelect,
  onOpen,
}: {
  card: CardData;
  columns: Column[];
  onMoveViaSelect: (cardId: string, columnId: string) => void;
  onOpen: (card: CardData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  return (
    <Card
      ref={setNodeRef}
      padding="sm"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="-m-1 grid h-8 w-8 shrink-0 touch-none place-items-center rounded-sm text-ink-300 transition-colors hover:text-ink-600 active:cursor-grabbing cursor-grab"
          aria-label={`Reordenar "${card.title}"`}
          {...attributes}
          {...listeners}
        >
          <DragHandle />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full flex-wrap items-start justify-between gap-2 rounded-sm text-left transition-colors hover:bg-surface-50"
            onClick={() => onOpen(card)}
          >
            <CardBody card={card} />
          </button>
          <label className="mt-2 block">
            <span className="sr-only">Mover "{card.title}" a otra columna</span>
            <Select
              className="w-full !rounded-sm !py-1.5 !text-caption text-ink-500"
              value={card.columnId}
              onChange={(e) => onMoveViaSelect(card.id, e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </Card>
  );
}

function BoardColumn({
  column,
  columns,
  onMoveViaSelect,
  onOpenCard,
}: {
  column: Column;
  columns: Column[];
  onMoveViaSelect: (cardId: string, columnId: string) => void;
  onOpenCard: (card: CardData) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 snap-start rounded-xl border p-3 transition-colors duration-150 ${
        isOver ? "border-blue-600 border-dashed bg-blue-100/40" : "border-line-100 bg-surface-50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-body-sm font-semibold text-ink-900">{column.name}</h4>
        <span className="font-mono text-mono-label text-ink-400">{column.cards.length}</span>
      </div>
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              columns={columns}
              onMoveViaSelect={onMoveViaSelect}
              onOpen={onOpenCard}
            />
          ))}
          {column.cards.length === 0 && <EmptyState compact title="Sin tarjetas" />}
        </div>
      </SortableContext>
    </div>
  );
}

export default function BoardTab({ ws, proj }: { ws: string; proj: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("task");
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  // Indica si hay más columnas fuera del viewport (el tablero solía cortarse sin aviso).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      setCanScrollLeft(el!.scrollLeft > 4);
      setCanScrollRight(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 4);
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [board]);

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

  async function persistMove(cardId: string, columnId: string, order?: number) {
    try {
      await api.board.moveCard(ws, proj, cardId, columnId, order);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo mover la tarjeta");
      await load();
    }
  }

  function moveCardViaSelect(id: string, columnId: string) {
    void persistMove(id, columnId);
  }

  function applyCardUpdate(updated: CardData) {
    setBoard((prev) => {
      if (!prev) return prev;
      // Si cambió de columna, recargar para respetar orden del servidor.
      const current = prev.columns.flatMap((c) => c.cards).find((c) => c.id === updated.id);
      if (!current || current.columnId !== updated.columnId) {
        void load();
        return prev;
      }
      return {
        ...prev,
        columns: prev.columns.map((col) => ({
          ...col,
          cards: col.cards.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
        })),
      };
    });
    setSelectedCard(null);
  }

  function handleDragStart(event: DragStartEvent) {
    if (!board) return;
    setActiveCard(board.columns.flatMap((c) => c.cards).find((c) => c.id === event.active.id) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!board || !over) return;
    const activeContainer = findContainer(board, String(active.id));
    const overContainer = findContainer(board, String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setBoard((prev) => {
      if (!prev) return prev;
      const columns = prev.columns.map((c) => ({ ...c, cards: [...c.cards] }));
      const from = columns.find((c) => c.id === activeContainer);
      const to = columns.find((c) => c.id === overContainer);
      if (!from || !to) return prev;
      const activeIndex = from.cards.findIndex((c) => c.id === active.id);
      if (activeIndex === -1) return prev;
      const [moved] = from.cards.splice(activeIndex, 1);
      const overIndex = to.cards.findIndex((c) => c.id === over.id);
      to.cards.splice(overIndex >= 0 ? overIndex : to.cards.length, 0, { ...moved, columnId: to.id });
      return { ...prev, columns };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!board) return;
    // Soltar fuera de cualquier columna: handleDragOver ya pudo haber movido la tarjeta
    // de forma optimista a otro contenedor, así que hay que resincronizar con el servidor.
    if (!over) return void load();
    const container = findContainer(board, String(over.id));
    if (!container) return void load();

    let finalOrder: number | undefined;

    setBoard((prev) => {
      if (!prev) return prev;
      const columns = prev.columns.map((c) => ({ ...c, cards: [...c.cards] }));
      const col = columns.find((c) => c.id === container);
      if (!col) return prev;
      const activeIndex = col.cards.findIndex((c) => c.id === active.id);
      const overIndex = col.cards.findIndex((c) => c.id === over.id);
      if (activeIndex === -1) return prev;
      if (overIndex !== -1 && activeIndex !== overIndex) {
        col.cards = arrayMove(col.cards, activeIndex, overIndex);
      }
      const idx = col.cards.findIndex((c) => c.id === active.id);
      const prevCard = col.cards[idx - 1];
      const nextCard = col.cards[idx + 1];
      if (prevCard && nextCard) finalOrder = (prevCard.order + nextCard.order) / 2;
      else if (prevCard) finalOrder = prevCard.order + 1;
      else if (nextCard) finalOrder = nextCard.order - 1;
      else finalOrder = 0;
      col.cards[idx] = { ...col.cards[idx], columnId: container, order: finalOrder };
      return { ...prev, columns };
    });

    await persistMove(String(active.id), container, finalOrder);
  }

  if (loading) return <SkeletonBoard />;
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
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de tarjeta">
            <option value="task">task</option>
            <option value="story">story</option>
            <option value="bug">bug</option>
          </Select>
          <Button type="submit">Añadir a {board.columns[0]?.name}</Button>
        </form>
      </Card>

      {/* Columnas */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveCard(null);
          // Cancelar (p. ej. Escape durante un drag por teclado) puede dejar el
          // reordenamiento optimista de handleDragOver sin persistir — resincroniza.
          void load();
        }}
        accessibility={{ announcements: announcements(board) }}
      >
        <div className="relative">
          {canScrollLeft && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface-0 to-transparent"
            />
          )}
          <div ref={scrollRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pr-1">
            {board.columns.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                columns={board.columns}
                onMoveViaSelect={moveCardViaSelect}
                onOpenCard={setSelectedCard}
              />
            ))}
          </div>
          {canScrollRight && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface-0 to-transparent"
            />
          )}
        </div>
        <DragOverlay>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>
      </DndContext>

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          columns={board.columns}
          ws={ws}
          proj={proj}
          onClose={() => setSelectedCard(null)}
          onChanged={applyCardUpdate}
        />
      )}
    </div>
  );
}
