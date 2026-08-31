import { randomUUID } from "node:crypto";
import type { Prisma } from "@/src/generated/prisma/client";
import { getDirectDatabaseUrl } from "@/src/lib/db/direct-url";
import { prisma } from "@/src/lib/prisma";
import { fanOut, NOTIFY_CHANNEL, type WorkspaceEventPayload } from "@/src/lib/realtime/types";
import { Client } from "pg";

let listenClient: Client | null = null;
let listenReady: Promise<void> | null = null;

export async function bumpWorkspaceRevision(workspaceId: string): Promise<number> {
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });
  return updated.revision;
}

export async function publishWorkspaceEvent(
  input: Omit<WorkspaceEventPayload, "revision"> & { revision?: number },
): Promise<WorkspaceEventPayload> {
  const revision =
    input.revision ?? (await bumpWorkspaceRevision(input.workspaceId));

  const event: WorkspaceEventPayload = {
    ...input,
    revision,
  };

  await prisma.workspaceEvent.create({
    data: {
      id: randomUUID(),
      workspaceId: event.workspaceId,
      revision: event.revision,
      type: event.type,
      resource: event.resource,
      resourceId: event.resourceId,
      payload: event.payload as Prisma.InputJsonValue,
      actorUserId: event.actorUserId,
      actorClientId: event.actorClientId,
    },
  });

  const payload = JSON.stringify(event);

  await prisma.$executeRaw`SELECT pg_notify(${NOTIFY_CHANNEL}, ${payload})`;

  fanOut(event);
  return event;
}

async function ensureListenClient(): Promise<Client> {
  if (listenClient && listenReady) {
    await listenReady;
    return listenClient;
  }

  listenClient = new Client({ connectionString: getDirectDatabaseUrl() });
  listenReady = listenClient
    .connect()
    .then(async () => {
      await listenClient!.query(`LISTEN ${NOTIFY_CHANNEL}`);
      listenClient!.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as WorkspaceEventPayload;
          fanOut(event);
        } catch {
          // ignore malformed payloads
        }
      });
    })
    .catch((error) => {
      listenClient = null;
      listenReady = null;
      throw error;
    });

  await listenReady;
  return listenClient;
}

export async function startWorkspaceListener(): Promise<void> {
  await ensureListenClient();
}

export async function getWorkspaceRevision(workspaceId: string): Promise<number> {
  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { revision: true },
  });
  return row?.revision ?? 0;
}

export async function getEventsAfterRevision(
  workspaceId: string,
  afterRevision: number,
  limit = 100,
): Promise<WorkspaceEventPayload[]> {
  const rows = await prisma.workspaceEvent.findMany({
    where: { workspaceId, revision: { gt: afterRevision } },
    orderBy: { revision: "asc" },
    take: limit,
  });

  return rows.map((row) => ({
    type: row.type as WorkspaceEventPayload["type"],
    workspaceId: row.workspaceId,
    revision: row.revision,
    actorUserId: row.actorUserId,
    actorClientId: row.actorClientId,
    resource: row.resource,
    resourceId: row.resourceId,
    payload: row.payload,
  }));
}
