import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/components/LoginScreen";
import { login } from "@/lib/api";

vi.mock("@/lib/api", () => ({ login: vi.fn() }));

const mockedLogin = vi.mocked(login);

const signIn = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginScreen", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
  });

  it("sends the typed credentials", async () => {
    mockedLogin.mockResolvedValue({ username: "user" });
    render(<LoginScreen onSignedIn={vi.fn()} />);
    await signIn("user", "password");
    expect(mockedLogin).toHaveBeenCalledWith("user", "password");
  });

  it("hands the signed in user back", async () => {
    const onSignedIn = vi.fn();
    mockedLogin.mockResolvedValue({ username: "user" });
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await signIn("user", "password");
    expect(onSignedIn).toHaveBeenCalledWith({ username: "user" });
  });

  it("shows one error for bad credentials and keeps the form", async () => {
    const onSignedIn = vi.fn();
    mockedLogin.mockRejectedValue(new Error("POST /api/auth/login failed: 401"));
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await signIn("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password."
    );
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("shows the same message whichever field was wrong", async () => {
    mockedLogin.mockRejectedValue(new Error("401"));

    const { unmount } = render(<LoginScreen onSignedIn={vi.fn()} />);
    await signIn("user", "wrong");
    const badPassword = (await screen.findByRole("alert")).textContent;
    unmount();

    render(<LoginScreen onSignedIn={vi.fn()} />);
    await signIn("nobody", "password");
    const badUsername = (await screen.findByRole("alert")).textContent;

    expect(badUsername).toBe(badPassword);
  });
});
