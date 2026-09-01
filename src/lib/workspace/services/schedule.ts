import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import {
  buildStaffDisplayNameMap,
  getDefaultWorkspace,
  getProjectIdByName,
} from "@/src/lib/workspace/context";
import { loadScheduleLegacy } from "@/src/lib/workspace/serialize";
import type { ScheduleEvent } from "@/src/types/workspace";
import type { ActorContext } from "@/src/lib/workspace/services/tasks";
import { viewerFromActor } from "@/src/lib/workspace/services/tasks";
import {
  createAssignmentNotifications,
  getNewAssigneeIds,
  resolveActorStaffId,
} from "@/src/lib/notifications/service";
import {
  assertProjectAccess,
  assertScheduleEventAccess,
  getProjectMemberStaffIds,
  mergeScheduleRecipientIds,
} from "@/src/lib/workspace/visibility";

export async function createScheduleEvent(input: {
  actor: ActorContext;
  event: Omit<ScheduleEvent, "id"> & { id?: string };
}): Promise<{ event: ScheduleEvent; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const eventId = input.event.id ?? randomUUID();
  const projectId = input.event.project
    ? await getProjectIdByName(workspace.id, input.event.project)
    : null;

  if (projectId) {
    await assertProjectAccess(workspace.id, projectId, viewerFromActor(input.actor));
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspace.id);
  const guestStaffIds = (input.event.guests ?? [])
    .map((name) => nameToId.get(name))
    .filter((id): id is string => Boolean(id));

  await prisma.scheduleEvent.create({
    data: {
      id: eventId,
      workspaceId: workspace.id,
      projectId,
      title: input.event.title.trim() || "Untitled",
      start: new Date(input.event.start),
      end: new Date(input.event.end),
      allDay: Boolean(input.event.allDay),
      description: input.event.description ?? "",
      location: input.event.location ?? "",
      color: input.event.color,
      guests: {
        create: guestStaffIds.map((staffMemberId) => ({ staffMemberId })),
      },
    },
  });

  const event = await loadScheduleLegacy(eventId, workspace.id);
  if (!event) throw new Error("Could not load created event.");

  const published = await publishWorkspaceEvent({
    type: "schedule.created",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: eventId,
    payload: event,
  });

  const actorStaffId = await resolveActorStaffId(workspace.id, input.actor.userId);
  const projectMemberIds = projectId ? await getProjectMemberStaffIds(projectId) : [];
  const allRecipientIds = mergeScheduleRecipientIds(projectMemberIds, guestStaffIds);
  const recipientIds = getNewAssigneeIds(new Set(), allRecipientIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId: workspace.id,
    type: "SCHEDULE_INVITED",
    resourceId: eventId,
    resourceLabel: event.title,
    scheduleStart: event.start,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
  }).catch((error) => {
    console.error("Could not create schedule invitation notifications.", error);
  });

  return { event, revision: published.revision };
}

export async function updateScheduleEvent(input: {
  actor: ActorContext;
  eventId: string;
  patch: Partial<ScheduleEvent>;
}): Promise<{ event: ScheduleEvent; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.scheduleEvent.findFirst({
    where: { id: input.eventId, workspaceId: workspace.id },
    include: { guests: true },
  });
  if (!existing) throw new Error("Schedule event not found.");

  await assertScheduleEventAccess(workspace.id, input.eventId, viewerFromActor(input.actor));

  const previousGuestIds = new Set(existing.guests.map((guest) => guest.staffMemberId));
  const previousProjectId = existing.projectId;
  let nextGuestIds: string[] | null = null;

  let projectId = existing.projectId;
  if (input.patch.project !== undefined) {
    projectId = input.patch.project
      ? await getProjectIdByName(workspace.id, input.patch.project)
      : null;
    if (projectId) {
      await assertProjectAccess(workspace.id, projectId, viewerFromActor(input.actor));
    }
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspace.id);

  await prisma.$transaction(async (tx) => {
    await tx.scheduleEvent.update({
      where: { id: input.eventId },
      data: {
        ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
        ...(input.patch.start !== undefined ? { start: new Date(input.patch.start) } : {}),
        ...(input.patch.end !== undefined ? { end: new Date(input.patch.end) } : {}),
        ...(input.patch.allDay !== undefined ? { allDay: input.patch.allDay } : {}),
        ...(input.patch.description !== undefined
          ? { description: input.patch.description }
          : {}),
        ...(input.patch.location !== undefined ? { location: input.patch.location } : {}),
        ...(input.patch.color !== undefined ? { color: input.patch.color } : {}),
        projectId,
      },
    });

    if (input.patch.guests !== undefined) {
      await tx.scheduleEventGuest.deleteMany({ where: { eventId: input.eventId } });
      nextGuestIds = [];
      for (const name of input.patch.guests) {
        const staffMemberId = nameToId.get(name);
        if (!staffMemberId) continue;
        nextGuestIds.push(staffMemberId);
        await tx.scheduleEventGuest.create({
          data: { eventId: input.eventId, staffMemberId },
        });
      }
    }
  });

  const event = await loadScheduleLegacy(input.eventId, workspace.id);
  if (!event) throw new Error("Could not load updated event.");

  const published = await publishWorkspaceEvent({
    type: "schedule.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: input.eventId,
    payload: event,
  });

  const recipientsChanged =
    input.patch.guests !== undefined || input.patch.project !== undefined;
  if (recipientsChanged) {
    const currentGuestIds = nextGuestIds ?? [...previousGuestIds];
    const previousProjectMemberIds = previousProjectId
      ? await getProjectMemberStaffIds(previousProjectId)
      : [];
    const nextProjectMemberIds = projectId ? await getProjectMemberStaffIds(projectId) : [];
    const previousRecipientIds = mergeScheduleRecipientIds(
      previousProjectMemberIds,
      [...previousGuestIds],
    );
    const nextRecipientIds = mergeScheduleRecipientIds(nextProjectMemberIds, currentGuestIds);
    const actorStaffId = await resolveActorStaffId(workspace.id, input.actor.userId);
    const recipientIds = getNewAssigneeIds(
      new Set(previousRecipientIds),
      nextRecipientIds,
      actorStaffId,
    );
    await createAssignmentNotifications({
      workspaceId: workspace.id,
      type: "SCHEDULE_INVITED",
      resourceId: input.eventId,
      resourceLabel: event.title,
      scheduleStart: event.start,
      recipientIds,
      actorUserId: input.actor.userId,
      actorClientId: input.actor.clientId ?? null,
    }).catch((error) => {
      console.error("Could not create schedule invitation notifications.", error);
    });
  }

  return { event, revision: published.revision };
}

export async function deleteScheduleEvent(input: {
  actor: ActorContext;
  eventId: string;
}): Promise<{ revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.scheduleEvent.findFirst({
    where: { id: input.eventId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Schedule event not found.");

  await assertScheduleEventAccess(workspace.id, input.eventId, viewerFromActor(input.actor));

  await prisma.scheduleEventGuest.deleteMany({ where: { eventId: input.eventId } });
  await prisma.scheduleEvent.delete({ where: { id: input.eventId } });

  const published = await publishWorkspaceEvent({
    type: "schedule.deleted",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: input.eventId,
    payload: { id: input.eventId },
  });

  return { revision: published.revision };
}
