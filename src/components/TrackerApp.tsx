"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AuthUserResponse } from "@/src/lib/auth/types";
import type { WorkspaceData } from "@/src/types/workspace";
import { TRACKER_SHELL_HTML } from "@/src/tracker/tracker-shell";
import { TrackerSkeleton } from "@/src/components/TrackerSkeleton";
import type { TrackerWorkspaceView } from "@/src/tracker/tracker-routes";
import { trackerViewFromPathname } from "@/src/tracker/tracker-routes";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: WorkspaceData | null; authUser: AuthUserResponse; workspaceRevision: number }
  | { status: "error"; message: string };

type BootPayload = {
  authUser: AuthUserResponse;
  data: WorkspaceData | null;
  workspaceRevision: number;
};

/** Deduplicate React Strict Mode / remount double-fetches of the heavy workspace payload. */
let bootPromise: Promise<BootPayload> | null = null;

async function loadBootPayload(): Promise<BootPayload> {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const fetchOptions: RequestInit = { cache: "no-store", credentials: "include" };

    const authResponse = await fetch("/api/auth/me", fetchOptions);
    if (authResponse.status === 401) {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
        () => undefined,
      );
      window.location.replace("/login");
      throw new Error("Unauthorized");
    }
    if (!authResponse.ok) {
      throw new Error("Could not verify your session.");
    }

    const authUser = (await authResponse.json()) as AuthUserResponse;
    const workspaceResponse = await fetch("/api/workspace", fetchOptions);

    if (workspaceResponse.status === 401) {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
        () => undefined,
      );
      window.location.replace("/login");
      throw new Error("Unauthorized");
    }

    if (workspaceResponse.ok) {
      const data = (await workspaceResponse.json()) as WorkspaceData;
      const revisionHeader = workspaceResponse.headers.get("X-Workspace-Revision");
      const workspaceRevision = revisionHeader ? Number.parseInt(revisionHeader, 10) : 0;
      return {
        authUser,
        data,
        workspaceRevision: Number.isFinite(workspaceRevision) ? workspaceRevision : 0,
      };
    }

    if (workspaceResponse.status === 404) {
      return { authUser, data: null, workspaceRevision: 0 };
    }

    const payload = (await workspaceResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `Failed to load workspace (${workspaceResponse.status}).`);
  })();

  try {
    return await bootPromise;
  } catch (error) {
    bootPromise = null;
    throw error;
  }
}

type TrackerAppProps = {
  initialView?: TrackerWorkspaceView;
};

export function TrackerApp({ initialView }: TrackerAppProps = {}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const resolvedInitialView = initialView ?? trackerViewFromPathname(pathname ?? "/");

  useEffect(() => {
    let cancelled = false;

    async function loadAppData() {
      try {
        const boot = await loadBootPayload();
        if (cancelled) return;
        setLoadState({
          status: "ready",
          data: boot.data,
          authUser: boot.authUser,
          workspaceRevision: boot.workspaceRevision,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.message === "Unauthorized") return;
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
        initialView: resolvedInitialView,
      });
    });
  }, [loadState, resolvedInitialView]);

  if (loadState.status === "loading") {
    return <TrackerSkeleton />;
  }

  if (loadState.status === "error") {
    return (
      <div className="app-shell">
        <div className="app-content">
          <header className="main-header">
            <div className="brand">
              <h1>Task Tracker</h1>
              <p className="backup-status visible error">{loadState.message}</p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  return <div ref={rootRef} />;
}
