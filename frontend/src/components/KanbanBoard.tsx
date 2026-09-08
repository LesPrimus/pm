"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ApiStatus } from "@/components/ApiStatus";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, moveCard } from "@/lib/kanban";
import { RENAME_DEBOUNCE_MS, useBoard } from "@/lib/useBoard";

type KanbanBoardProps = {
  username: string;
  onSignOut: () => void;
};

export const KanbanBoard = ({ username, onSignOut }: KanbanBoardProps) => {
  const { board, status, error, commit, replace } = useBoard();
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    commit({
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) return;
    commit(
      {
        ...board,
        columns: board.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      },
      // Typing a title is one write, not one per keystroke.
      RENAME_DEBOUNCE_MS
    );
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (!board) return;
    const id = createId("card");
    commit({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) return;
    commit({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
  };

  const activeCard = activeCardId && board ? board.cards[activeCardId] : null;

  if (status === "loading") {
    return (
      <main
        data-testid="board-loading"
        className="flex min-h-screen items-center justify-center text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]"
      >
        Loading your board
      </main>
    );
  }

  if (status === "error" || !board) {
    return (
      <main
        data-testid="board-load-error"
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <p className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Could not load your board
        </p>
        <p className="max-w-sm text-sm leading-6 text-[var(--gray-text)]">
          The API did not answer. Check the server is running, then try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative flex">
        <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
          <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Single Board Kanban
                </p>
                <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                  Kanban Studio
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                  Keep momentum visible. Rename columns, drag cards between stages,
                  and capture quick notes without getting buried in settings.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-3">
                  <span
                    data-testid="signed-in-user"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                  >
                    {username}
                  </span>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
                  >
                    Log out
                  </button>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                    Focus
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                    One board. Five columns. Zero clutter.
                  </p>
                </div>
              </div>
            </div>
            {error && (
              <p
                role="status"
                data-testid="board-error"
                className="rounded-2xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)]"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <ApiStatus />
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>

        <ChatSidebar onBoardUpdate={replace} />
      </div>
    </div>
  );
};
