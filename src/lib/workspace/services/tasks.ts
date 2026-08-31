import { randomUUID } from "node:crypto";
import type { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import {
  buildStaffDisplayNameMap,
  getDefaultWorkspace,
  getProjectIdByName,
} from "@/src/lib/workspace/context";
import { loadTaskLegacy, mapTaskRow } from "@/src/lib/workspace/serialize";
import {
  TASK_STATUS_TO_DB,
  toTaskStatusLabel,
} from "@/src/lib/workspace/roles";
import type { LegacyTask, TaskStatusLabel } from "@/src/types/workspace";
import {
  createAssignmentNotifications,
  getNewAssigneeIds,
  resolveActorStaffId,
} from "@/src/lib/notifications/service";

export type ActorContext = {
  userId: string;
  clientId?: string | null;
};

function normalizeOwners(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      ),
    ];
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export async function createTask(input: {
  actor: ActorContext;
  title: string;
  team: string;
  description?: string;
  priority?: string;
  due?: string;
  status?: TaskStatusLabel;
  owners?: string[];
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const projectId = await getProjectIdByName(workspace.id, input.team);
  if (!projectId) {
    throw new Error(`Unknown project "${input.team}".`);
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspace.id);
  const owners = normalizeOwners(input.owners ?? []);
  const taskId = randomUUID();

  const maxSort = await prisma.task.aggregate({
    where: { workspaceId: workspace.id, status: TASK_STATUS_TO_DB[input.status ?? "To Do"] },
    _max: { sortOrder: true },
  });

  await prisma.task.create({
    data: {
      id: taskId,
      workspaceId: workspace.id,
      projectId,
      title: input.title.trim() || "Untitled task",
      description: input.description ?? "",
      priority: input.priority === "High" ? "High" : "Low",
      due: input.due ?? "",
      status: TASK_STATUS_TO_DB[toTaskStatusLabel(input.status ?? "To Do")],
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      owners: {
        create: owners.map((name, index) => {
          const staffMemberId = nameToId.get(name);
          if (!staffMemberId) {
            throw new Error(`Unknown owner "${name}".`);
          }
          return { staffMemberId, sortOrder: index };
        }),
      },
    },
  });

  const task = await loadTaskLegacy(taskId, workspace.id);
  if (!task) throw new Error("Could not load created task.");

  const event = await publishWorkspaceEvent({
    type: "task.created",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: taskId,
    payload: task,
  });

  const actorStaffId = await resolveActorStaffId(workspace.id, input.actor.userId);
  const ownerIds = owners
    .map((name) => nameToId.get(name))
    .filter((id): id is string => Boolean(id));
  const recipientIds = getNewAssigneeIds(new Set(), ownerIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId: workspace.id,
    type: "TASK_ASSIGNED",
    resourceId: taskId,
    resourceLabel: task.title,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
  }).catch((error) => {
    console.error("Could not create task assignment notifications.", error);
  });

  return { task, revision: event.revision };
}

export async function updateTask(input: {
  actor: ActorContext;
  taskId: string;
  title?: string;
  description?: string;
  team?: string;
  priority?: string;
  due?: string;
  owners?: string[];
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.task.findFirst({
    where: { id: input.taskId, workspaceId: workspace.id },
    include: { owners: true },
  });
  if (!existing) throw new Error("Task not found.");

  let projectId = existing.projectId;
  if (input.team) {
    const nextProjectId = await getProjectIdByName(workspace.id, input.team);
    if (!nextProjectId) throw new Error(`Unknown project "${input.team}".`);
    projectId = nextProjectId;
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspace.id);
  const previousOwnerIds = new Set(existing.owners.map((owner) => owner.staffMemberId));
  let nextOwnerIds: string[] | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: input.taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() || "Untitled task" } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined
          ? { priority: input.priority === "High" ? "High" : "Low" }
          : {}),
        ...(input.due !== undefined ? { due: input.due } : {}),
        projectId,
      },
    });

    if (input.owners !== undefined) {
      await tx.taskOwner.deleteMany({ where: { taskId: input.taskId } });
      const owners = normalizeOwners(input.owners);
      nextOwnerIds = [];
      for (let index = 0; index < owners.length; index += 1) {
        const staffMemberId = nameToId.get(owners[index]!);
        if (!staffMemberId) throw new Error(`Unknown owner "${owners[index]}".`);
        nextOwnerIds.push(staffMemberId);
        await tx.taskOwner.create({
          data: { taskId: input.taskId, staffMemberId, sortOrder: index },
        });
      }
    }
  });

  const task = await loadTaskLegacy(input.taskId, workspace.id);
  if (!task) throw new Error("Could not load updated task.");

  const event = await publishWorkspaceEvent({
    type: "task.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: task,
  });

  if (nextOwnerIds) {
    const actorStaffId = await resolveActorStaffId(workspace.id, input.actor.userId);
    const recipientIds = getNewAssigneeIds(previousOwnerIds, nextOwnerIds, actorStaffId);
    await createAssignmentNotifications({
      workspaceId: workspace.id,
      type: "TASK_ASSIGNED",
      resourceId: input.taskId,
      resourceLabel: task.title,
      recipientIds,
      actorUserId: input.actor.userId,
      actorClientId: input.actor.clientId ?? null,
    }).catch((error) => {
      console.error("Could not create task assignment notifications.", error);
    });
  }

  return { task, revision: event.revision };
}

export async function moveTask(input: {
  actor: ActorContext;
  taskId: string;
  status: TaskStatusLabel;
  sortOrder?: number;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.task.findFirst({
    where: { id: input.taskId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Task not found.");

  const status = TASK_STATUS_TO_DB[toTaskStatusLabel(input.status)];
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const maxSort = await prisma.task.aggregate({
      where: { workspaceId: workspace.id, status },
      _max: { sortOrder: true },
    });
    sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  }

  await prisma.task.update({
    where: { id: input.taskId },
    data: { status, sortOrder },
  });

  const task = await loadTaskLegacy(input.taskId, workspace.id);
  if (!task) throw new Error("Could not load moved task.");

  const event = await publishWorkspaceEvent({
    type: "task.moved",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { task, status: input.status, sortOrder },
  });

  return { task, revision: event.revision };
}

export async function addTaskUpdate(input: {
  actor: ActorContext;
  taskId: string;
  text: string;
  staffMemberId?: string | null;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.task.findFirst({
    where: { id: input.taskId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Task not found.");

  const updateId = randomUUID();
  await prisma.taskUpdate.create({
    data: {
      id: updateId,
      taskId: input.taskId,
      staffMemberId: input.staffMemberId ?? null,
      text: input.text.trim(),
      createdAt: new Date(),
    },
  });

  const task = await loadTaskLegacy(input.taskId, workspace.id);
  if (!task) throw new Error("Could not load task.");

  const event = await publishWorkspaceEvent({
    type: "task.update.added",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: task,
  });

  return { task, revision: event.revision };
}

export async function deleteTask(input: {
  actor: ActorContext;
  taskId: string;
}): Promise<{ trashId: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const task = await loadTaskLegacy(input.taskId, workspace.id);
  if (!task) throw new Error("Task not found.");

  const trashId = randomUUID();
  const payload = {
    ...task,
    trashId,
    previousStatus: task.status,
    deletedAt: new Date().toISOString(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.deletedTask.create({
      data: {
        trashId,
        workspaceId: workspace.id,
        previousStatus: task.status,
        deletedAt: new Date(),
        payload: payload as Prisma.InputJsonValue,
      },
    });
    await tx.taskUpdate.deleteMany({ where: { taskId: input.taskId } });
    await tx.taskOwner.deleteMany({ where: { taskId: input.taskId } });
    await tx.task.delete({ where: { id: input.taskId } });
  });

  const event = await publishWorkspaceEvent({
    type: "task.deleted",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { trashId, task: payload },
  });

  return { trashId, revision: event.revision };
}

export async function archiveTask(input: {
  actor: ActorContext;
  taskId: string;
}): Promise<{ archivedId: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const task = await loadTaskLegacy(input.taskId, workspace.id);
  if (!task) throw new Error("Task not found.");

  const archivedId = randomUUID();
  const payload = {
    ...task,
    archivedId,
    archivedAt: new Date().toISOString(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.archivedTask.create({
      data: {
        archivedId,
        workspaceId: workspace.id,
        archivedAt: new Date(),
        payload: payload as Prisma.InputJsonValue,
      },
    });
    await tx.taskUpdate.deleteMany({ where: { taskId: input.taskId } });
    await tx.taskOwner.deleteMany({ where: { taskId: input.taskId } });
    await tx.task.delete({ where: { id: input.taskId } });
  });

  const event = await publishWorkspaceEvent({
    type: "task.archived",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { archivedId, task: payload },
  });

  return { archivedId, revision: event.revision };
}

export async function restoreTrashTask(input: {
  actor: ActorContext;
  trashId: string;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const entry = await prisma.deletedTask.findFirst({
    where: { trashId: input.trashId, workspaceId: workspace.id },
  });
  if (!entry) throw new Error("Deleted task not found.");

  const payload = entry.payload as LegacyTask & {
    trashId?: string;
    previousStatus?: string;
    deletedAt?: string;
  };

  const { nameToId } = await buildStaffDisplayNameMap(workspace.id);
  const projectId = await getProjectIdByName(workspace.id, payload.team ?? "Unassigned");
  if (!projectId) throw new Error(`Unknown project "${payload.team}".`);

  const owners = normalizeOwners(payload.owners ?? payload.owner);
  const taskId = payload.id || randomUUID();
  const status = TASK_STATUS_TO_DB[toTaskStatusLabel(payload.previousStatus ?? payload.status)];

  const maxSort = await prisma.task.aggregate({
    where: { workspaceId: workspace.id, status },
    _max: { sortOrder: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.task.create({
      data: {
        id: taskId,
        workspaceId: workspace.id,
        projectId,
        title: payload.title ?? "Untitled task",
        description: payload.description ?? "",
        priority: payload.priority === "High" ? "High" : "Low",
        due: payload.due ?? "",
        status,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        owners: {
          create: owners.map((name, index) => {
            const staffMemberId = nameToId.get(name);
            if (!staffMemberId) throw new Error(`Unknown owner "${name}".`);
            return { staffMemberId, sortOrder: index };
          }),
        },
        updates: {
          create: (payload.updates ?? []).map((update) => ({
            id: update.id ?? randomUUID(),
            text: update.text,
            createdAt: new Date(update.createdAt),
          })),
        },
      },
    });
    await tx.deletedTask.delete({ where: { trashId: input.trashId } });
  });

  const task = await loadTaskLegacy(taskId, workspace.id);
  if (!task) throw new Error("Could not load restored task.");

  const event = await publishWorkspaceEvent({
    type: "task.restored",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: taskId,
    payload: task,
  });

  return { task, revision: event.revision };
}
