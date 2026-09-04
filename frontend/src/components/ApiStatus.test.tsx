import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiStatus } from "@/components/ApiStatus";
import { getHealth } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getHealth: vi.fn() }));

const mockedGetHealth = vi.mocked(getHealth);

describe("ApiStatus", () => {
  beforeEach(() => {
    mockedGetHealth.mockReset();
  });

  it("reports a healthy API", async () => {
    mockedGetHealth.mockResolvedValue({ status: "ok" });
    render(<ApiStatus />);
    expect(await screen.findByText(/api connected/i)).toBeInTheDocument();
  });

  it("reports an unreachable API", async () => {
    mockedGetHealth.mockRejectedValue(new Error("boom"));
    render(<ApiStatus />);
    expect(await screen.findByText(/api unreachable/i)).toBeInTheDocument();
  });
});
