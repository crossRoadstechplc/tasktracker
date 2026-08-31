import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/api/guard";
import {
  getEventsAfterRevision,
  getWorkspaceRevision,
  startWorkspaceListener,
} from "@/src/lib/realtime/notify";
import { subscribe, type WorkspaceEventPayload } from "@/src/lib/realtime/types";
import { getDefaultWorkspace } from "@/src/lib/workspace/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

function formatSse(event: WorkspaceEventPayload): string {
  return `id: ${event.revision}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;

  const workspace = await getDefaultWorkspace();
  const afterParam = new URL(request.url).searchParams.get("after");
  const afterRevision = afterParam ? Number.parseInt(afterParam, 10) : 0;

  try {
    await startWorkspaceListener();
  } catch (error) {
    console.error("Could not start workspace listener.", error);
    return NextResponse.json(
      { error: "Realtime listener unavailable. Set DIRECT_URL for Neon pooler URLs." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      const currentRevision = await getWorkspaceRevision(workspace.id);
      enqueue(`: connected revision=${currentRevision}\n\n`);

      const missed = await getEventsAfterRevision(
        workspace.id,
        Number.isFinite(afterRevision) ? afterRevision : 0,
      );
      for (const event of missed) {
        enqueue(formatSse(event));
      }

      unsubscribe = subscribe({
        workspaceId: workspace.id,
        afterRevision: Number.isFinite(afterRevision) ? afterRevision : 0,
        enqueue: (event) => enqueue(formatSse(event)),
        close: () => {
          if (!closed) controller.close();
        },
      });

      heartbeat = setInterval(() => {
        enqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
