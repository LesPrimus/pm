import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, getHealth } from "@/lib/api";

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the same origin when no base URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(apiUrl("/api/health")).toBe("/api/health");
  });

  it("prefixes the configured base URL", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000");
    expect(apiUrl("/api/health")).toBe("http://127.0.0.1:8000/api/health");
  });
});

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) })
    );
    await expect(getHealth()).resolves.toEqual({ status: "ok" });
  });

  it("sends credentials so the session cookie travels", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);
    await getHealth();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("throws on a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getHealth()).rejects.toThrow("503");
  });
});
