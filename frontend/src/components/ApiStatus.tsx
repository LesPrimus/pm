"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

type State = "checking" | "ok" | "error";

const label: Record<State, string> = {
  checking: "Checking API",
  ok: "API connected",
  error: "API unreachable",
};

const dot: Record<State, string> = {
  checking: "bg-[var(--gray-text)]",
  ok: "bg-[var(--primary-blue)]",
  error: "bg-[var(--accent-yellow)]",
};

export const ApiStatus = () => {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let active = true;
    getHealth()
      .then((health) => active && setState(health.status === "ok" ? "ok" : "error"))
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <span
      data-testid="api-status"
      data-state={state}
      className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
    >
      <span className={`h-2 w-2 rounded-full ${dot[state]}`} />
      {label[state]}
    </span>
  );
};
