import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";
import { getHealth, getMe, login, logout } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getHealth: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const mocked = {
  getHealth: vi.mocked(getHealth),
  getMe: vi.mocked(getMe),
  login: vi.mocked(login),
  logout: vi.mocked(logout),
};

const unauthorized = () => new Error("GET /api/auth/me failed: 401");

describe("AuthGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getHealth.mockResolvedValue({ status: "ok" });
  });

  it("shows the login screen when there is no session", async () => {
    mocked.getMe.mockRejectedValue(unauthorized());
    render(<AuthGate />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kanban Studio", level: 1 })).toBeTruthy();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
  });

  it("shows the board when a session already exists", async () => {
    mocked.getMe.mockResolvedValue({ username: "user" });
    render(<AuthGate />);
    expect(await screen.findByTestId("column-col-backlog")).toBeInTheDocument();
    expect(screen.getByTestId("signed-in-user")).toHaveTextContent("user");
  });

  it("swaps to the board after a successful sign in", async () => {
    mocked.getMe.mockRejectedValue(unauthorized());
    mocked.login.mockResolvedValue({ username: "user" });
    render(<AuthGate />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByTestId("column-col-backlog")).toBeInTheDocument();
  });

  it("returns to the login screen after logging out", async () => {
    mocked.getMe.mockResolvedValue({ username: "user" });
    mocked.logout.mockResolvedValue({ status: "signed out" });
    render(<AuthGate />);

    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));

    expect(mocked.logout).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
  });

  it("keeps the board hidden while the session check is in flight", () => {
    mocked.getMe.mockReturnValue(new Promise(() => {}));
    render(<AuthGate />);
    expect(screen.getByTestId("auth-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
