"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TaskOpsSplash } from "@/src/components/TaskOpsSplash";

const SPLASH_MIN_MS = 1600;

/** One in-flight exchange per token so Strict Mode does not consume twice. */
const handoffByToken = new Map<string, Promise<{ ok: true } | { ok: false; error: string }>>();

function exchangeToken(token: string) {
  const existing = handoffByToken.get(token);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch("/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ exchangeToken: token }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        handoffByToken.delete(token);
        return {
          ok: false as const,
          error: payload?.error ?? "Handoff failed.",
        };
      }
      return { ok: true as const };
    } catch {
      handoffByToken.delete(token);
      return { ok: false as const, error: "Could not complete handoff." };
    }
  })();

  handoffByToken.set(token, promise);
  return promise;
}

export default function HandoffClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Missing handoff token.");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      const result = await exchangeToken(token);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      if (cancelled) return;
      router.replace("/");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <main className="task-ops-splash-error">
        <h1>Task Operations</h1>
        <p>{error}</p>
        <a href="/login">Go to login</a>
      </main>
    );
  }

  return <TaskOpsSplash label="Opening Task Operations…" />;
}
