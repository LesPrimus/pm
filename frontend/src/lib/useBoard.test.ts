import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBoard, putBoard } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { RENAME_DEBOUNCE_MS, useBoard } from "@/lib/useBoard";

vi.mock("@/lib/api", () => ({ getBoard: vi.fn(), putBoard: vi.fn() }));

const mockedGetBoard = vi.mocked(getBoard);
const mockedPutBoard = vi.mocked(putBoard);

const board = (title: string): BoardData => ({
  columns: [{ id: "col-a", title, cardIds: ["card-1"] }],
  cards: { "card-1": { id: "card-1", title: "One", details: "" } },
});

const LOADED = board("Backlog");

describe("useBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetBoard.mockResolvedValue(LOADED);
    mockedPutBoard.mockImplementation(async (next) => next);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const loaded = async () => {
    const view = renderHook(() => useBoard());
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    return view;
  };

  it("loads the board from the API", async () => {
    const { result } = await loaded();
    expect(result.current.board).toEqual(LOADED);
    expect(mockedGetBoard).toHaveBeenCalledTimes(1);
  });

  it("reports a failed load", async () => {
    mockedGetBoard.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.board).toBeNull();
  });

  it("shows an edit at once and saves it", async () => {
    const { result } = await loaded();
    const next = board("Renamed");

    act(() => result.current.commit(next));

    expect(result.current.board).toEqual(next);
    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledWith(next, false));
  });

  it("puts the confirmed board back when a save fails", async () => {
    const { result } = await loaded();
    mockedPutBoard.mockRejectedValue(new Error("500"));

    act(() => result.current.commit(board("Doomed")));

    await waitFor(() => expect(result.current.board).toEqual(LOADED));
    expect(result.current.error).toMatch(/could not save/i);
  });

  it("clears the error on the next successful save", async () => {
    const { result } = await loaded();
    mockedPutBoard.mockRejectedValueOnce(new Error("500"));

    act(() => result.current.commit(board("Doomed")));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.commit(board("Second try")));
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("collapses debounced edits into one write", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await loaded();

    act(() => result.current.commit(board("B"), RENAME_DEBOUNCE_MS));
    act(() => result.current.commit(board("Ba"), RENAME_DEBOUNCE_MS));
    act(() => result.current.commit(board("Bac"), RENAME_DEBOUNCE_MS));
    expect(mockedPutBoard).not.toHaveBeenCalled();
    // The screen keeps up even though nothing has been written yet.
    expect(result.current.board).toEqual(board("Bac"));

    act(() => vi.advanceTimersByTime(RENAME_DEBOUNCE_MS));
    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledTimes(1));
    expect(mockedPutBoard).toHaveBeenCalledWith(board("Bac"), false);
  });

  it("flushes a pending write when the page goes away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await loaded();

    act(() => result.current.commit(board("Typed but not saved"), RENAME_DEBOUNCE_MS));
    expect(mockedPutBoard).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    // keepalive, so the request survives the page going away.
    await waitFor(() =>
      expect(mockedPutBoard).toHaveBeenCalledWith(board("Typed but not saved"), true)
    );
  });

  it("an immediate edit supersedes a pending debounced one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await loaded();

    act(() => result.current.commit(board("Typing"), RENAME_DEBOUNCE_MS));
    act(() => result.current.commit(board("Dragged")));

    await waitFor(() => expect(mockedPutBoard).toHaveBeenCalledTimes(1));
    act(() => vi.advanceTimersByTime(RENAME_DEBOUNCE_MS * 2));
    expect(mockedPutBoard).toHaveBeenCalledTimes(1);
    expect(mockedPutBoard).toHaveBeenCalledWith(board("Dragged"), false);
  });
});
