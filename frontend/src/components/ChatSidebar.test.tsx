import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { sendChat } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({ sendChat: vi.fn() }));

const mockedSendChat = vi.mocked(sendChat);

const BOARD: BoardData = {
  columns: [{ id: "col-a", title: "Backlog", cardIds: ["card-1"] }],
  cards: { "card-1": { id: "card-1", title: "First", details: "One" } },
};

const answer = (reply: string, boardUpdated = false) => ({
  reply,
  board_updated: boardUpdated,
  board: BOARD,
});

const open = async () => {
  await userEvent.click(screen.getByTestId("chat-toggle"));
  return screen.getByTestId("chat-panel");
};

const ask = async (text: string) => {
  await userEvent.type(screen.getByLabelText(/message the assistant/i), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSendChat.mockResolvedValue(answer("Sure."));
  });

  it("collapses and expands", async () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();

    await open();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("renders the exchange in order", async () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await open();
    await ask("What is in progress?");

    await waitFor(() =>
      expect(screen.getAllByTestId("chat-message")).toHaveLength(2)
    );
    const turns = screen.getAllByTestId("chat-message");
    expect(turns[0]).toHaveAttribute("data-role", "user");
    expect(turns[0]).toHaveTextContent("What is in progress?");
    expect(turns[1]).toHaveAttribute("data-role", "assistant");
    expect(turns[1]).toHaveTextContent("Sure.");
  });

  it("sends the earlier turns as history, and the new message on its own", async () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await open();

    await ask("first");
    await waitFor(() => expect(mockedSendChat).toHaveBeenCalledTimes(1));
    expect(mockedSendChat).toHaveBeenLastCalledWith("first", []);

    mockedSendChat.mockResolvedValue(answer("Second answer."));
    await ask("second");
    await waitFor(() => expect(mockedSendChat).toHaveBeenCalledTimes(2));
    // The history is what was already on screen, and carries no display-only fields.
    expect(mockedSendChat).toHaveBeenLastCalledWith("second", [
      { role: "user", content: "first" },
      { role: "assistant", content: "Sure." },
    ]);
  });

  it("hands over a board the AI changed, and marks the turn", async () => {
    const onBoardUpdate = vi.fn();
    mockedSendChat.mockResolvedValue(answer("Moved it.", true));
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);
    await open();
    await ask("Move card 1 to Done");

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(BOARD));
    expect(screen.getByTestId("chat-board-updated")).toBeInTheDocument();
  });

  it("leaves the board alone when the AI only answered", async () => {
    const onBoardUpdate = vi.fn();
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);
    await open();
    await ask("How many cards?");

    await waitFor(() => expect(screen.getAllByTestId("chat-message")).toHaveLength(2));
    expect(onBoardUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("chat-board-updated")).not.toBeInTheDocument();
  });

  it("shows a pending indicator while waiting", async () => {
    let answerNow: (value: Awaited<ReturnType<typeof sendChat>>) => void =
      () => {};
    mockedSendChat.mockReturnValue(
      new Promise((resolve) => {
        answerNow = resolve;
      })
    );
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await open();
    await ask("Slow one");

    expect(screen.getByTestId("chat-pending")).toBeInTheDocument();
    answerNow(answer("Done."));
    await waitFor(() =>
      expect(screen.queryByTestId("chat-pending")).not.toBeInTheDocument()
    );
  });

  it("keeps a failed message recoverable", async () => {
    mockedSendChat.mockRejectedValue(new Error("502"));
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await open();
    await ask("Move card 1 to Done");

    expect(await screen.findByTestId("chat-error")).toBeInTheDocument();
    // Back in the box rather than stranded in a thread that got no answer.
    expect(screen.getByLabelText(/message the assistant/i)).toHaveValue(
      "Move card 1 to Done"
    );
    expect(screen.queryAllByTestId("chat-message")).toHaveLength(0);

    mockedSendChat.mockResolvedValue(answer("Moved it."));
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(mockedSendChat).toHaveBeenLastCalledWith("Move card 1 to Done", [])
    );
  });
});
