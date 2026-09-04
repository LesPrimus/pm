import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanColumn } from "@/components/KanbanColumn";
import type { Card, Column } from "@/lib/kanban";

const column: Column = {
  id: "col-a",
  title: "Backlog",
  cardIds: ["card-1", "card-2"],
};

const cards: Card[] = [
  { id: "card-1", title: "First", details: "One" },
  { id: "card-2", title: "Second", details: "Two" },
];

// Same activation constraint as KanbanBoard: without it a pointerdown starts a
// drag immediately and swallows clicks on controls inside a card.
const Dnd = ({ children }: { children: ReactNode }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
};

const renderColumn = (props: Partial<Parameters<typeof KanbanColumn>[0]> = {}) =>
  render(
    <Dnd>
      <KanbanColumn
        column={column}
        cards={cards}
        onRename={vi.fn()}
        onAddCard={vi.fn()}
        onDeleteCard={vi.fn()}
        {...props}
      />
    </Dnd>
  );

describe("KanbanColumn", () => {
  it("renders its cards and the card count", () => {
    renderColumn();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
  });

  it("shows an empty state with no cards", () => {
    renderColumn({ cards: [], column: { ...column, cardIds: [] } });
    expect(screen.getByText(/drop a card here/i)).toBeInTheDocument();
    expect(screen.getByText("0 cards")).toBeInTheDocument();
  });

  it("reports renames as the title is edited", async () => {
    const onRename = vi.fn();
    renderColumn({ onRename });
    await userEvent.type(screen.getByLabelText("Column title"), "!");
    expect(onRename).toHaveBeenCalledWith("col-a", "Backlog!");
  });

  it("reports deletes with the owning column", async () => {
    const onDeleteCard = vi.fn();
    renderColumn({ onDeleteCard });
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /delete first/i }));
    expect(onDeleteCard).toHaveBeenCalledWith("col-a", "card-1");
  });

  it("reports added cards with the owning column", async () => {
    const onAddCard = vi.fn();
    renderColumn({ onAddCard });
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "Third");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(onAddCard).toHaveBeenCalledWith("col-a", "Third", "");
  });
});
