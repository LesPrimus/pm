"use client";

import { useEffect, useRef, useState } from "react";
import { sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const CHAT_FAILED = "The assistant did not answer. Your message is still here.";

/** A turn as shown. `changedBoard` drives the highlight; it is not sent back. */
type Turn = ChatMessage & { changedBoard?: boolean };

type ChatSidebarProps = {
  /** Called with the board the AI saved, so the page can show it at once. */
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view. Assigning scrollTop rather than calling
  // scrollTo, which jsdom does not implement.
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [turns, sending]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    // What the model gets as history is exactly what is on screen now, without
    // the display-only flag.
    const history = turns.map(({ role, content }) => ({ role, content }));
    const asked: Turn[] = [...turns, { role: "user", content: message }];

    setTurns(asked);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const answer = await sendChat(message, history);
      setTurns([
        ...asked,
        {
          role: "assistant",
          content: answer.reply,
          changedBoard: answer.board_updated,
        },
      ]);
      if (answer.board_updated) onBoardUpdate(answer.board);
    } catch {
      // Take the unsent message back out of the thread and put it in the box,
      // so sending again is one click rather than retyping.
      setTurns(turns);
      setInput(message);
      setError(CHAT_FAILED);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <aside className="sticky top-0 h-screen shrink-0 py-12 pr-6">
        <button
          type="button"
          data-testid="chat-toggle"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="flex h-full w-14 flex-col items-center justify-center gap-4 rounded-[28px] border border-[var(--stroke)] bg-white/80 shadow-[var(--shadow)] backdrop-blur transition hover:border-[var(--primary-blue)]"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
          <span className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-[var(--navy-dark)] [writing-mode:vertical-rl]">
            Ask AI
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="chat-panel"
      className="sticky top-0 flex h-screen w-[380px] shrink-0 flex-col gap-4 py-12 pr-6"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-[var(--stroke)] bg-white/80 shadow-[var(--shadow)] backdrop-blur">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--stroke)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Assistant
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
              Ask about the board
            </h2>
          </div>
          <button
            type="button"
            data-testid="chat-toggle"
            aria-expanded
            aria-label="Close the assistant"
            onClick={() => setOpen(false)}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </header>

        <div ref={feed} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {turns.length === 0 && (
            <p className="text-sm leading-6 text-[var(--gray-text)]">
              Try &ldquo;move the QA card to Done&rdquo;, &ldquo;add a card for
              the release notes&rdquo;, or just ask what is in progress.
            </p>
          )}
          {turns.map((turn, index) => (
            <div
              key={index}
              data-testid="chat-message"
              data-role={turn.role}
              className={
                turn.role === "user"
                  ? "ml-8 rounded-2xl bg-[var(--primary-blue)] px-4 py-3 text-sm leading-6 text-white"
                  : turn.changedBoard
                    ? "mr-8 rounded-2xl border border-[var(--accent-yellow)] bg-[#fdf6e3] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
                    : "mr-8 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
              }
            >
              {turn.content}
              {turn.changedBoard && (
                <span
                  data-testid="chat-board-updated"
                  className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-yellow)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  Board updated
                </span>
              )}
            </div>
          ))}
          {sending && (
            <p
              data-testid="chat-pending"
              role="status"
              className="mr-8 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]"
            >
              Thinking
            </p>
          )}
        </div>

        {error && (
          <p
            data-testid="chat-error"
            className="mx-6 mb-3 rounded-2xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)]"
          >
            {error}
          </p>
        )}

        <form
          onSubmit={submit}
          className="flex items-end gap-3 border-t border-[var(--stroke)] px-6 py-5"
        >
          <textarea
            aria-label="Message the assistant"
            placeholder="Ask or tell the assistant"
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-h-[52px] flex-1 resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  );
};
