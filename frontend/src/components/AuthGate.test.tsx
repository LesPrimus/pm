import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";
import { getBoard, getHealth, getMe, login, logout, putBoard } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  getHealth: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
}));

const BOARD: BoardData = {
  columns: [{ id: "col-a", title: "Backlog", cardIds: ["card-1"] }],
  cards: { "card-1": { id: "card-1", title: "First", details: "" } },
};

const mocked = {
  getHealth: vi.mocked(getHealth),
  getMe: vi.mocked(getMe),
  login: vi.mocked(login),
  logout: vi.mocked(logout),
  getBoard: vi.mocked(getBoard),
  putBoard: vi.mocked(putBoard),
};

const unauthorized = () => new Error("GET /api/auth/me failed: 401");

describe("AuthGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getHealth.mockResolvedValue({ status: "ok" });
    mocked.getBoard.mockResolvedValue(BOARD);
    mocked.putBoard.mockImplementation(async (board) => board);
  });

  it("shows the login screen when there is no session", async () => {
    mocked.getMe.mockRejectedValue(unauthorized());
    render(<AuthGate />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kanban Studio", level: 1 })).toBeTruthy();
    expect(screen.queryByTestId("column-col-a")).not.toBeInTheDocument();
  });

  it("shows the board when a session already exists", async () => {
    mocked.getMe.mockResolvedValue({ username: "user" });
    render(<AuthGate />);
    expect(await screen.findByTestId("column-col-a")).toBeInTheDocument();
    expect(screen.getByTestId("signed-in-user")).toHaveTextContent("user");
  });

  it("swaps to the board after a successful sign in", async () => {
    mocked.getMe.mockRejectedValue(unauthorized());
    mocked.login.mockResolvedValue({ username: "user" });
    render(<AuthGate />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByTestId("column-col-a")).toBeInTheDocument();
  });

  it("returns to the login screen after logging out", async () => {
    mocked.getMe.mockResolvedValue({ username: "user" });
    mocked.logout.mockResolvedValue({ status: "signed out" });
    render(<AuthGate />);

    await screen.findByTestId("column-col-a");
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(mocked.logout).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-a")).not.toBeInTheDocument();
  });

  it("keeps the board hidden while the session check is in flight", () => {
    mocked.getMe.mockReturnValue(new Promise(() => {}));
    render(<AuthGate />);
    expect(screen.getByTestId("auth-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-a")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
