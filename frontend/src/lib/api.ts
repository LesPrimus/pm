import type { BoardData } from "@/lib/kanban";

// Empty base URL means same origin, which is how the app is deployed: FastAPI
// serves this site and the API. `npm run dev` sets NEXT_PUBLIC_API_BASE_URL to
// the backend origin instead.
const baseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export const apiUrl = (path: string) => `${baseUrl()}${path}`;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), { credentials: "include", ...init });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export type Health = { status: string };

export const getHealth = () => request<Health>("/api/health");

export type User = { username: string };

/** Resolves to the signed in user, or rejects with a 401 when there is no session. */
export const getMe = () => request<User>("/api/auth/me");

export const login = (username: string, password: string) =>
  send<User>("POST", "/api/auth/login", { username, password });

export const logout = () => send<{ status: string }>("POST", "/api/auth/logout");

/** The signed in user's board, seeded by the backend on first read. */
export const getBoard = () => request<BoardData>("/api/board");

/**
 * Replaces the whole board. Rejects with a 422 if the board is inconsistent.
 * `keepalive` lets a save started as the page goes away still reach the server.
 */
export const putBoard = (board: BoardData, keepalive = false) =>
  request<BoardData>("/api/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
    keepalive,
  });

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResponse = {
  reply: string;
  /** True when the AI changed the board. The backend has already saved it. */
  board_updated: boolean;
  /** The stored board, changed or not, so the client can resync from any reply. */
  board: BoardData;
};

/** Ask the AI about the board. The history is held by the client, not the server. */
export const sendChat = (message: string, history: ChatMessage[]) =>
  send<ChatResponse>("POST", "/api/chat", { message, history });
