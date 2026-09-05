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

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export type Health = { status: string };

export const getHealth = () => request<Health>("/api/health");

export type User = { username: string };

/** Resolves to the signed in user, or rejects with a 401 when there is no session. */
export const getMe = () => request<User>("/api/auth/me");

export const login = (username: string, password: string) =>
  post<User>("/api/auth/login", { username, password });

export const logout = () => post<{ status: string }>("/api/auth/logout");
