import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { getBoard, getHealth, putBoard, sendChat } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  getHealth: vi.fn(),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
  sendChat: vi.fn(),
}));

const mockedGetBoard = vi.mocked(getBoard);
const mockedPutBoard = vi.mocked(putBoard);

const LOADED: BoardData = {
  columns: [
    { id: "col-a", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "Done", cardIds: [] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "First", details: "One" },
    "card-2": { id: "card-2", title: "Second", details: "Two" },
  },
};

const renderBoard = async () => {
  render(<KanbanBoard username="user" onSignOut={vi.fn()} />);
  await screen.findByTestId("column-col-a");
};

const columnA = () => screen.getByTestId("column-col-a");

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getHealth).mockResolvedValue({ status: "ok" });
    mockedGetBoard.mockResolvedValue(LOADED);
    mockedPutBoard.mockImplementation(async (board) => board);
  });

  it("shows a loading state before the board arrives", () => {
    mockedGetBoard.mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard username="user" onSignOut={vi.fn()} />);
    expect(screen.getByTestId("board-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-a")).not.toBeInTheDocument();
  });

  it("shows an error state when the board cannot be loaded", async () => {
    mockedGetBoard.mockRejectedValue(new Error("500"));
    render(<KanbanBoard username="user" onSignOut={vi.fn()} />);
    expect(await screen.findByTestId("board-load-error")).toBeInTheDocument();
  });

  it("renders the board it was given, not a hardcoded one", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(2);
    expect(within(columnA()).getByText("First")).toBeInTheDocument();
  });

  it("saves an added card", async () => {
    await renderBoard();
    await userEvent.click(within(columnA()).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(columnA()).getByPlaceholderText(/card title/i), "Third");
    await userEvent.click(within(columnA()).getByRole("button", { name: /add card/i }));

    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledTimes(1));
    const saved = mockedPutBoard.mock.calls[0][0];
    const added = Object.values(saved.cards).find((card) => card.title === "Third");
    expect(added).toBeDefined();
    expect(saved.columns[0].cardIds).toContain(added!.id);
  });

  it("saves a deleted card", async () => {
    await renderBoard();
    await userEvent.click(
      within(columnA()).getByRole("button", { name: /delete first/i })
    );

    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledTimes(1));
    const saved = mockedPutBoard.mock.calls[0][0];
    expect(saved.cards["card-1"]).toBeUndefined();
    expect(saved.columns[0].cardIds).toEqual(["card-2"]);
  });

  it("writes a rename once, not once per keystroke", async () => {
    await renderBoard();
    await userEvent.type(within(columnA()).getByLabelText("Column title"), "!!!");

    // Three keystrokes, one write once the debounce elapses.
    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(mockedPutBoard.mock.calls[0][0].columns[0].title).toBe("Backlog!!!");
  });

  it("restores the board and warns when a save fails", async () => {
    await renderBoard();
    mockedPutBoard.mockRejectedValue(new Error("500"));

    await userEvent.click(
      within(columnA()).getByRole("button", { name: /delete first/i })
    );

    expect(await screen.findByTestId("board-error")).toHaveTextContent(
      /could not save/i
    );
    // The optimistic delete is undone.
    expect(within(columnA()).getByText("First")).toBeInTheDocument();
  });
});

describe("KanbanBoard and the assistant", () => {
  const MOVED: BoardData = {
    ...LOADED,
    columns: [
      { id: "col-a", title: "Backlog", cardIds: ["card-2"] },
      { id: "col-b", title: "Done", cardIds: ["card-1"] },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getHealth).mockResolvedValue({ status: "ok" });
    mockedGetBoard.mockResolvedValue(LOADED);
    mockedPutBoard.mockImplementation(async (board) => board);
  });

  const chat = async (message: string) => {
    await userEvent.click(screen.getByTestId("chat-toggle"));
    await userEvent.type(screen.getByLabelText(/message the assistant/i), message);
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
  };

  it("shows a board the AI changed, without saving it again", async () => {
    vi.mocked(sendChat).mockResolvedValue({
      reply: "Moved it to Done.",
      board_updated: true,
      board: MOVED,
    });
    await renderBoard();
    expect(within(columnA()).getByText("First")).toBeInTheDocument();

    await chat("Move First to Done");

    await waitFor(() =>
      expect(within(screen.getByTestId("column-col-b")).getByText("First")).toBeInTheDocument()
    );
    expect(within(columnA()).queryByText("First")).not.toBeInTheDocument();
    // The chat endpoint already stored it, so a PUT would be a wasted round trip.
    expect(mockedPutBoard).not.toHaveBeenCalled();
  });

  it("leaves the board alone when the AI only answered", async () => {
    vi.mocked(sendChat).mockResolvedValue({
      reply: "Two cards.",
      board_updated: false,
      board: MOVED,
    });
    await renderBoard();

    await chat("How many cards?");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    // The board in the reply is ignored when board_updated is false.
    expect(within(columnA()).getByText("First")).toBeInTheDocument();
    expect(mockedPutBoard).not.toHaveBeenCalled();
  });
});
