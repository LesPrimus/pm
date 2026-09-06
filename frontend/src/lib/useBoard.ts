"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBoard, putBoard } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

export const RENAME_DEBOUNCE_MS = 500;

const SAVE_FAILED = "Could not save your changes. The board was restored.";

type Status = "loading" | "ready" | "error";

/**
 * Owns the board. Every edit updates the screen at once and writes the whole
 * board to the API. A failed write puts back the last board the server confirmed.
 */
export const useBoard = () => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  // The last board the server accepted, and the debounced write not yet sent.
  const confirmed = useRef<BoardData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BoardData | null>(null);

  useEffect(() => {
    let active = true;
    getBoard()
      .then((loaded) => {
        if (!active) return;
        confirmed.current = loaded;
        setBoard(loaded);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (next: BoardData, keepalive = false) => {
    pending.current = null;
    try {
      await putBoard(next, keepalive);
      confirmed.current = next;
      setError(null);
    } catch {
      if (confirmed.current) setBoard(confirmed.current);
      setError(SAVE_FAILED);
    }
  }, []);

  /** Send a debounced write now rather than waiting out its delay. */
  const flush = useCallback(() => {
    if (!timer.current || !pending.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void save(pending.current, true);
  }, [save]);

  // Without this, renaming a column and reloading straight away loses the
  // rename: the page goes before the debounce fires.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  /**
   * Show `next` immediately, then persist it. Renames pass a delay, so typing a
   * column title is one write rather than one per keystroke; the whole board is
   * sent either way, so a later edit simply supersedes a pending one.
   */
  const commit = useCallback(
    (next: BoardData, delayMs = 0) => {
      setBoard(next);
      if (timer.current) clearTimeout(timer.current);

      if (delayMs === 0) {
        pending.current = null;
        void save(next);
        return;
      }
      pending.current = next;
      timer.current = setTimeout(() => void save(next), delayMs);
    },
    [save]
  );

  return { board, status, error, commit, flush };
};
