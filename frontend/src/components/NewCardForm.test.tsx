import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewCardForm } from "@/components/NewCardForm";

const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
};

describe("NewCardForm", () => {
  it("stays collapsed until asked", () => {
    render(<NewCardForm onAdd={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/card title/i)).not.toBeInTheDocument();
  });

  it("submits a trimmed title and details", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "  Ship it  ");
    await userEvent.type(screen.getByPlaceholderText(/details/i), "  soon  ");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(onAdd).toHaveBeenCalledWith("Ship it", "soon");
  });

  it("rejects a blank title", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/card title/i)).toBeInTheDocument();
  });

  it("clears and collapses after adding", async () => {
    render(<NewCardForm onAdd={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "One");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(screen.queryByPlaceholderText(/card title/i)).not.toBeInTheDocument();
    await open();
    expect(screen.getByPlaceholderText(/card title/i)).toHaveValue("");
  });

  it("discards input on cancel", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "Nope");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onAdd).not.toHaveBeenCalled();
    await open();
    expect(screen.getByPlaceholderText(/card title/i)).toHaveValue("");
  });
});
