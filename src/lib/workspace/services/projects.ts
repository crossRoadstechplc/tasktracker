import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import { getDefaultWorkspace } from "@/src/lib/workspace/context";
import type { ActorContext } from "@/src/lib/workspace/services/tasks";
import { viewerFromActor } from "@/src/lib/workspace/services/tasks";
import {
  createAssignmentNotifications,
  getNewAssigneeIds,
  resolveActorStaffId,
} from "@/src/lib/notifications/service";
import {
  assertProjectAccess,
  ensureProjectMembers,
} from "@/src/lib/workspace/visibility";

export async function createProject(input: {
  actor: ActorContext;
  name: string;
}): Promise<{ id: string; name: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const maxSort = await prisma.project.aggregate({
    where: { workspaceId: workspace.id },
    _max: { sortOrder: true },
  });

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: input.name.trim(),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await ensureProjectMembers(project.id, [input.actor.staffMemberId]);

  const published = await publishWorkspaceEvent({
    type: "project.created",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: project.id,
    payload: { id: project.id, name: project.name },
  });

  return { id: project.id, name: project.name, revision: published.revision };
}

export async function updateProject(input: {
  actor: ActorContext;
  projectId: string;
  name?: string;
  leaderId?: string | null;
}): Promise<{ id: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Project not found.");

  await assertProjectAccess(workspace.id, input.projectId, viewerFromActor(input.actor));

  const project = await prisma.project.update({
    where: { id: input.projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {}),
    },
  });

  const published = await publishWorkspaceEvent({
    type: "project.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: project.id,
    payload: { id: project.id, name: project.name, leaderId: project.leaderId },
  });

  return { id: project.id, revision: published.revision };
}

export async function deleteProject(input: {
  actor: ActorContext;
  projectId: string;
}): Promise<{ revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Project not found.");

  await assertProjectAccess(workspace.id, input.projectId, viewerFromActor(input.actor));

  const taskCount = await prisma.task.count({ where: { projectId: input.projectId } });
  if (taskCount > 0) {
    throw new Error("Cannot delete a project that still has tasks.");
  }

  await prisma.projectMember.deleteMany({ where: { projectId: input.projectId } });
  await prisma.project.delete({ where: { id: input.projectId } });

  const published = await publishWorkspaceEvent({
    type: "project.deleted",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: input.projectId,
    payload: { id: input.projectId },
  });

  return { revision: published.revision };
}

export async function setProjectMembers(input: {
  actor: ActorContext;
  projectId: string;
  memberIds: string[];
}): Promise<{ revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Project not found.");

  await assertProjectAccess(workspace.id, input.projectId, viewerFromActor(input.actor));

  const previousMembers = await prisma.projectMember.findMany({
    where: { projectId: input.projectId },
    select: { staffMemberId: true },
  });
  const previousMemberIds = new Set(previousMembers.map((row) => row.staffMemberId));

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId: input.projectId } });
    for (const staffMemberId of input.memberIds) {
      await tx.projectMember.create({
        data: { projectId: input.projectId, staffMemberId },
      });
    }
  });

  const published = await publishWorkspaceEvent({
    type: "project.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: input.projectId,
    payload: { id: input.projectId, memberIds: input.memberIds },
  });

  const actorStaffId = await resolveActorStaffId(workspace.id, input.actor.userId);
  const recipientIds = getNewAssigneeIds(previousMemberIds, input.memberIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId: workspace.id,
    type: "PROJECT_ASSIGNED",
    resourceId: input.projectId,
    resourceLabel: existing.name,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
  }).catch((error) => {
    console.error("Could not create project assignment notifications.", error);
  });

  return { revision: published.revision };
}
