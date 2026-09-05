"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";
import { getMe, logout, type User } from "@/lib/api";

// The site is a static export, so there is no server to redirect an anonymous
// visitor. The gate is client side: ask the API who we are, then render.
export const AuthGate = () => {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    await logout().catch(() => undefined);
    setUser(null);
  };

  if (checking) {
    return (
      <main
        data-testid="auth-checking"
        className="flex min-h-screen items-center justify-center text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]"
      >
        Loading
      </main>
    );
  }

  if (!user) {
    return <LoginScreen onSignedIn={setUser} />;
  }

  return <KanbanBoard username={user.username} onSignOut={handleSignOut} />;
};
