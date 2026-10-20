import { prisma } from "@/src/lib/prisma";
import type { PermissionRoleLabel } from "@/src/types/workspace";

export type WorkspaceViewer = {
  staffMemberId: string;
  permissionRole: PermissionRoleLabel;
};

export class ForbiddenError extends Error {
  constructor(message = "Forbidden.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function canSeeAllProjects(role: PermissionRoleLabel): boolean {
  return role === "Super Admin" || role === "Admin";
}

export function canSeeAllTasks(role: PermissionRoleLabel): boolean {
  return canSeeAllProjects(role);
}

export function isTaskVisibleToViewer(input: {
  viewerStaffMemberId: string;
  viewerRole: PermissionRoleLabel;
  ownerStaffMemberIds: string[];
  projectLeaderId: string | null | undefined;
}): boolean {
  if (canSeeAllTasks(input.viewerRole)) return true;
  if (input.ownerStaffMemberIds.includes(input.viewerStaffMemberId)) return true;
  if (
    input.ownerStaffMemberIds.length === 0 &&
    input.projectLeaderId &&
    input.projectLeaderId === input.viewerStaffMemberId
  ) {
    return true;
  }
  return false;
}

export function taskEventRecipientStaffIds(
  ownerStaffMemberIds: string[],
  projectLeaderId: string | null | undefined,
): string[] {
  if (ownerStaffMemberIds.length > 0) {
    return [...new Set(ownerStaffMemberIds.filter(Boolean))];
  }
  return projectLeaderId ? [projectLeaderId] : [];
}

/** Returns null when the viewer can see all projects; otherwise a set of accessible project IDs. */
export async function getAccessibleProjectIds(
  workspaceId: string,
  staffMemberId: string,
  role: PermissionRoleLabel,
): Promise<Set<string> | null> {
  if (canSeeAllProjects(role)) return null;

  const projects = await prisma.project.findMany({
    where: {
      workspaceId,
      OR: [
        { leaderId: staffMemberId },
        { members: { some: { staffMemberId } } },
      ],
    },
    select: { id: true },
  });

  return new Set(projects.map((project) => project.id));
}

export async function hasProjectAccess(
  workspaceId: string,
  projectId: string,
  viewer: WorkspaceViewer,
): Promise<boolean> {
  const accessible = await getAccessibleProjectIds(
    workspaceId,
    viewer.staffMemberId,
    viewer.permissionRole,
  );
  if (accessible === null) return true;
  return accessible.has(projectId);
}

export async function assertProjectAccess(
  workspaceId: string,
  projectId: string,
  viewer: WorkspaceViewer,
): Promise<void> {
  const allowed = await hasProjectAccess(workspaceId, projectId, viewer);
  if (!allowed) {
    throw new ForbiddenError("You do not have access to this project.");
  }
}

export async function assertTaskAccess(
  workspaceId: string,
  taskId: string,
  viewer: WorkspaceViewer,
): Promise<{ projectId: string }> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: {
      projectId: true,
      project: { select: { leaderId: true } },
      owners: { select: { staffMemberId: true } },
    },
  });
  if (!task) {
    throw new Error("Task not found.");
  }

  await assertProjectAccess(workspaceId, task.projectId, viewer);

  const visible = isTaskVisibleToViewer({
    viewerStaffMemberId: viewer.staffMemberId,
    viewerRole: viewer.permissionRole,
    ownerStaffMemberIds: task.owners.map((owner) => owner.staffMemberId),
    projectLeaderId: task.project.leaderId,
  });
  if (!visible) {
    throw new ForbiddenError("You do not have access to this task.");
  }

  return { projectId: task.projectId };
}

export async function assertScheduleEventAccess(
  workspaceId: string,
  eventId: string,
  viewer: WorkspaceViewer,
): Promise<void> {
  const accessible = await getAccessibleProjectIds(
    workspaceId,
    viewer.staffMemberId,
    viewer.permissionRole,
  );
  if (accessible === null) return;

  const event = await prisma.scheduleEvent.findFirst({
    where: { id: eventId, workspaceId },
    include: { guests: { select: { staffMemberId: true } } },
  });
  if (!event) {
    throw new Error("Schedule event not found.");
  }

  if (event.projectId && accessible.has(event.projectId)) return;
  if (event.guests.some((guest) => guest.staffMemberId === viewer.staffMemberId)) return;

  throw new ForbiddenError("You do not have access to this schedule event.");
}

export async function assertTrashAccess(
  workspaceId: string,
  trashId: string,
  viewer: WorkspaceViewer,
): Promise<void> {
  if (canSeeAllTasks(viewer.permissionRole)) return;

  const entry = await prisma.deletedTask.findFirst({
    where: { trashId, workspaceId },
    select: { payload: true },
  });
  if (!entry) {
    throw new Error("Deleted task not found.");
  }

  const payload = entry.payload as Record<string, unknown>;
  const team = typeof payload.team === "string" ? payload.team : "";
  if (!team) {
    throw new ForbiddenError("You do not have access to this deleted task.");
  }

  const project = await prisma.project.findFirst({
    where: { workspaceId, name: team },
    select: { id: true, leaderId: true },
  });
  if (!project) {
    throw new ForbiddenError("You do not have access to this deleted task.");
  }

  await assertProjectAccess(workspaceId, project.id, viewer);

  const ownerNames = Array.isArray(payload.owners)
    ? payload.owners.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : typeof payload.owner === "string" && payload.owner.trim()
      ? [payload.owner.trim()]
      : [];

  const staff = await prisma.staffMember.findMany({
    where: { workspaceId, displayName: { in: ownerNames } },
    select: { id: true },
  });

  const visible = isTaskVisibleToViewer({
    viewerStaffMemberId: viewer.staffMemberId,
    viewerRole: viewer.permissionRole,
    ownerStaffMemberIds: staff.map((member) => member.id),
    projectLeaderId: project.leaderId,
  });
  if (!visible) {
    throw new ForbiddenError("You do not have access to this deleted task.");
  }
}

export async function ensureProjectMembers(
  projectId: string,
  staffMemberIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(staffMemberIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  for (const staffMemberId of uniqueIds) {
    await prisma.projectMember.upsert({
      where: {
        projectId_staffMemberId: { projectId, staffMemberId },
      },
      create: { projectId, staffMemberId },
      update: {},
    });
  }
}

/** All staff member IDs on a project (members + leader). */
export async function getProjectMemberStaffIds(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      leaderId: true,
      members: { select: { staffMemberId: true } },
    },
  });
  if (!project) return [];

  const ids = new Set(project.members.map((member) => member.staffMemberId));
  if (project.leaderId) ids.add(project.leaderId);
  return [...ids];
}

function uniqueRecipientIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function mergeScheduleRecipientIds(
  projectMemberIds: string[],
  guestIds: string[],
): string[] {
  return uniqueRecipientIds([...projectMemberIds, ...guestIds]);
}

export async function resolveViewerFromUserId(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceViewer | null> {
  const staffMember = await prisma.staffMember.findFirst({
    where: { workspaceId, userId },
    select: { id: true, permissionRole: true },
  });
  if (!staffMember) return null;

  const { PERMISSION_ROLE_FROM_DB } = await import("@/src/lib/workspace/roles");
  return {
    staffMemberId: staffMember.id,
    permissionRole: PERMISSION_ROLE_FROM_DB[staffMember.permissionRole],
  };
}
