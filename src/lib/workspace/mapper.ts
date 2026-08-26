import { prisma } from "@/src/lib/prisma";
import {
  DEFAULT_WORKSPACE_SLUG,
  PERMISSION_ROLE_FROM_DB,
  PERMISSION_ROLE_LABELS,
  TASK_STATUS_FROM_DB,
} from "@/src/lib/workspace/roles";
import type {
  ArchivedTask,
  DeletedTask,
  LegacyTask,
  PermissionRoleLabel,
  ScheduleEvent,
  StaffProfile,
  WorkspaceData,
} from "@/src/types/workspace";

function buildStaffMaps(
  staffMembers: Awaited<ReturnType<typeof loadWorkspace>>["staffMembers"],
) {
  const staff: string[] = [];
  const staffProfiles: Record<string, StaffProfile> = {};
  const idToDisplayName = new Map<string, string>();

  for (const member of staffMembers) {
    staff.push(member.displayName);
    idToDisplayName.set(member.id, member.displayName);
    const invitePending = Boolean(member.user?.mustChangePassword);
    staffProfiles[member.displayName] = {
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[member.permissionRole],
      ...(member.user?.email ? { email: member.user.email } : {}),
      inviteStatus: invitePending ? "pending" : "active",
    };
  }

  return { staff, staffProfiles, idToDisplayName };
}

function mapTask(
  task: Awaited<ReturnType<typeof loadWorkspace>>["tasks"][number],
  idToDisplayName: Map<string, string>,
): LegacyTask {
  const owners = task.owners
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((owner) => idToDisplayName.get(owner.staffMemberId) ?? "")
    .filter(Boolean);

  return {
    id: task.id,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    team: task.project.name,
    owner: owners[0] ?? "",
    owners,
    priority: task.priority,
    due: task.due,
    status: TASK_STATUS_FROM_DB[task.status],
    updates: task.updates
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((update) => ({
        id: update.id,
        text: update.text,
        createdAt: update.createdAt.toISOString(),
      })),
  };
}

async function loadWorkspace(workspaceId: string) {
  return prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: {
      staffMembers: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: {
            select: {
              email: true,
              mustChangePassword: true,
              inviteExpiresAt: true,
            },
          },
        },
      },
      projects: {
        orderBy: { sortOrder: "asc" },
        include: {
          members: { include: { staffMember: true } },
          leader: true,
        },
      },
      orgTeams: {
        orderBy: { sortOrder: "asc" },
        include: {
          members: { include: { staffMember: true } },
        },
      },
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: {
          project: true,
          owners: { orderBy: { sortOrder: "asc" } },
          updates: { orderBy: { createdAt: "desc" } },
        },
      },
      deletedTasks: { orderBy: { deletedAt: "desc" } },
      archivedTasks: { orderBy: { archivedAt: "desc" } },
      scheduleEvents: {
        orderBy: { start: "asc" },
        include: {
          project: true,
          guests: { include: { staffMember: true } },
        },
      },
      permissionRules: true,
    },
  });
}

export async function getWorkspaceBySlug(slug = DEFAULT_WORKSPACE_SLUG) {
  return prisma.workspace.findUnique({
    where: { slug },
  });
}

export async function getLegacyWorkspaceData(
  workspaceId: string,
): Promise<WorkspaceData> {
  const workspace = await loadWorkspace(workspaceId);
  const { staff, staffProfiles, idToDisplayName } = buildStaffMaps(workspace.staffMembers);

  const teams = workspace.projects.map((project) => project.name);
  const teamMembers: Record<string, string[]> = {};
  const teamLeaders: Record<string, string> = {};

  for (const project of workspace.projects) {
    teamMembers[project.name] = project.members
      .map((member) => member.staffMember.displayName)
      .filter((name) => staff.includes(name));
    teamLeaders[project.name] = project.leader?.displayName ?? "";
  }

  const orgTeams = workspace.orgTeams.map((team) => team.name);
  const orgTeamMembers: Record<string, string[]> = {};

  for (const orgTeam of workspace.orgTeams) {
    orgTeamMembers[orgTeam.name] = orgTeam.members
      .map((member) => member.staffMember.displayName)
      .filter((name) => staff.includes(name));
  }

  const tasks = workspace.tasks.map((task) => mapTask(task, idToDisplayName));

  const deletedTasks = workspace.deletedTasks.map((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    return {
      ...(payload as DeletedTask),
      trashId: entry.trashId,
      previousStatus: entry.previousStatus,
      deletedAt: entry.deletedAt.toISOString(),
    };
  });

  const archivedTasks = workspace.archivedTasks.map((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    return {
      ...(payload as ArchivedTask),
      archivedId: entry.archivedId,
      archivedAt: entry.archivedAt.toISOString(),
    };
  });

  const events: ScheduleEvent[] = workspace.scheduleEvents
    .filter((event) => event.start && event.end)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      description: event.description,
      location: event.location,
      project: event.project?.name ?? "",
      color: event.color,
      guests: event.guests
        .map((guest) => guest.staffMember.displayName)
        .filter((name) => staff.includes(name)),
    }));

  const permissionMatrix = PERMISSION_ROLE_LABELS.reduce(
    (matrix, roleLabel) => {
      matrix[roleLabel] = {};
      return matrix;
    },
    {} as Record<PermissionRoleLabel, Record<string, boolean>>,
  );

  for (const rule of workspace.permissionRules) {
    const roleLabel = PERMISSION_ROLE_FROM_DB[rule.role];
    permissionMatrix[roleLabel][rule.actionId] = rule.allowed;
  }

  return {
    tasks,
    teams,
    deletedTasks,
    archivedTasks,
    staff,
    staffProfiles,
    teamMembers,
    teamLeaders,
    orgTeams,
    orgTeamMembers,
    schedule: { events },
    permissionMatrix,
  };
}

export async function getLegacyWorkspaceDataBySlug(
  slug = DEFAULT_WORKSPACE_SLUG,
): Promise<WorkspaceData | null> {
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return null;
  return getLegacyWorkspaceData(workspace.id);
}
