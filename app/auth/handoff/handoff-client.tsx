"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoader } from "@/src/components/PageLoader";

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
    void exchangeToken(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        router.replace("/");
        return;
      }
      setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <h1>Task Operations</h1>
        <p>{error}</p>
        <a href="/login">Go to login</a>
      </main>
    );
  }

  return <PageLoader label="Opening Task Operations…" />;
}
