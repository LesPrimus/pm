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

export type Health = { status: string };

export const getHealth = () => request<Health>("/api/health");
