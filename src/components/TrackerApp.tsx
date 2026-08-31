"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthUserResponse } from "@/src/lib/auth/types";
import type { WorkspaceData } from "@/src/types/workspace";
import { TRACKER_SHELL_HTML } from "@/src/tracker/tracker-shell";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: WorkspaceData | null; authUser: AuthUserResponse; workspaceRevision: number }
  | { status: "error"; message: string };

export function TrackerApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadAppData() {
      try {
        const fetchOptions: RequestInit = { cache: "no-store", credentials: "include" };

        const authResponse = await fetch("/api/auth/me", fetchOptions);
        if (cancelled) return;

        if (authResponse.status === 401) {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
            () => undefined,
          );
          window.location.replace("/login");
          return;
        }

        if (!authResponse.ok) {
          throw new Error("Could not verify your session.");
        }

        const authUser = (await authResponse.json()) as AuthUserResponse;
        const workspaceResponse = await fetch("/api/workspace", fetchOptions);
        if (cancelled) return;

        if (workspaceResponse.status === 401) {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
            () => undefined,
          );
          window.location.replace("/login");
          return;
        }

        if (workspaceResponse.ok) {
          const data = (await workspaceResponse.json()) as WorkspaceData;
          const revisionHeader = workspaceResponse.headers.get("X-Workspace-Revision");
          const workspaceRevision = revisionHeader
            ? Number.parseInt(revisionHeader, 10)
            : 0;
          setLoadState({
            status: "ready",
            data,
            authUser,
            workspaceRevision: Number.isFinite(workspaceRevision) ? workspaceRevision : 0,
          });
          return;
        }

        if (workspaceResponse.status === 404) {
          setLoadState({ status: "ready", data: null, authUser, workspaceRevision: 0 });
          return;
        }

        const payload = (await workspaceResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Failed to load workspace (${workspaceResponse.status}).`);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Could not load the task tracker.";
        setLoadState({ status: "error", message });
      }
    }

    loadAppData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadState.status !== "ready" || !rootRef.current || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    rootRef.current.innerHTML = TRACKER_SHELL_HTML;

    import("@/src/tracker/tracker-app").then(({ initTrackerApp }) => {
      initTrackerApp({
        preloadData: loadState.data ?? undefined,
        authUser: loadState.authUser,
        workspaceRevision: loadState.workspaceRevision,
      });
    });
  }, [loadState]);

  if (loadState.status === "loading") {
    return (
      <div className="app-shell">
        <div className="app-content">
          <header className="main-header">
            <div className="brand">
              <h1>Company Task Tracker</h1>
              <p>Loading workspace…</p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="app-shell">
        <div className="app-content">
          <header className="main-header">
            <div className="brand">
              <h1>Company Task Tracker</h1>
              <p className="backup-status visible error">{loadState.message}</p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  return <div ref={rootRef} />;
}
