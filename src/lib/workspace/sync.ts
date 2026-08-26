import { randomUUID } from "node:crypto";
import type { Prisma } from "@/src/generated/prisma/client";
import { emailForDisplayName } from "@/src/lib/auth/seed-users";
import { prisma } from "@/src/lib/prisma";
import {
  PERMISSION_ROLE_TO_DB,
  TASK_STATUS_TO_DB,
  toPermissionRoleLabel,
  toTaskStatusLabel,
} from "@/src/lib/workspace/roles";
import type { WorkspaceData } from "@/src/types/workspace";

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
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export async function syncLegacyWorkspaceData(
  workspaceId: string,
  data: WorkspaceData,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existingStaffLinks = await tx.staffMember.findMany({
      where: { workspaceId },
      select: { id: true, displayName: true, userId: true },
    });
    const staffLinkByDisplayName = new Map(
      existingStaffLinks.map((member) => [member.displayName, member]),
    );
    const users = await tx.user.findMany({ select: { id: true, email: true } });
    const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));

    await tx.permissionRule.deleteMany({ where: { workspaceId } });
    await tx.scheduleEventGuest.deleteMany({
      where: { event: { workspaceId } },
    });
    await tx.scheduleEvent.deleteMany({ where: { workspaceId } });
    await tx.taskUpdate.deleteMany({ where: { task: { workspaceId } } });
    await tx.taskOwner.deleteMany({ where: { task: { workspaceId } } });
    await tx.task.deleteMany({ where: { workspaceId } });
    await tx.deletedTask.deleteMany({ where: { workspaceId } });
    await tx.archivedTask.deleteMany({ where: { workspaceId } });
    await tx.projectMember.deleteMany({ where: { project: { workspaceId } } });
    await tx.orgTeamMember.deleteMany({ where: { orgTeam: { workspaceId } } });
    await tx.project.deleteMany({ where: { workspaceId } });
    await tx.orgTeam.deleteMany({ where: { workspaceId } });
    await tx.staffMember.deleteMany({ where: { workspaceId } });

    const staffIdByName = new Map<string, string>();

    for (let index = 0; index < data.staff.length; index += 1) {
      const displayName = data.staff[index];
      const profile = data.staffProfiles[displayName] ?? {
        firstName: displayName.split(/\s+/)[0] ?? displayName,
        lastName: displayName.split(/\s+/).slice(1).join(" "),
        role: "",
        permissionRole: "Junior Staff" as const,
      };

      const existing = staffLinkByDisplayName.get(displayName);
      const linkedUserId =
        existing?.userId ?? userIdByEmail.get(emailForDisplayName(displayName)) ?? null;

      const member = await tx.staffMember.create({
        data: {
          ...(existing ? { id: existing.id } : {}),
          workspaceId,
          userId: linkedUserId,
          displayName,
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          jobTitle: profile.role ?? "",
          permissionRole:
            PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(profile.permissionRole)],
          sortOrder: index,
        },
      });

      staffIdByName.set(displayName, member.id);
    }

    const projectIdByName = new Map<string, string>();

    for (let index = 0; index < data.teams.length; index += 1) {
      const name = data.teams[index];
      const leaderName = data.teamLeaders[name] ?? "";
      const leaderId = leaderName ? (staffIdByName.get(leaderName) ?? null) : null;

      const project = await tx.project.create({
        data: {
          workspaceId,
          name,
          sortOrder: index,
          leaderId,
        },
      });

      projectIdByName.set(name, project.id);

      for (const memberName of data.teamMembers[name] ?? []) {
        const staffMemberId = staffIdByName.get(memberName);
        if (!staffMemberId) continue;

        await tx.projectMember.create({
          data: { projectId: project.id, staffMemberId },
        });
      }
    }

    for (let index = 0; index < data.orgTeams.length; index += 1) {
      const name = data.orgTeams[index];
      const orgTeam = await tx.orgTeam.create({
        data: { workspaceId, name, sortOrder: index },
      });

      for (const memberName of data.orgTeamMembers[name] ?? []) {
        const staffMemberId = staffIdByName.get(memberName);
        if (!staffMemberId) continue;

        await tx.orgTeamMember.create({
          data: { orgTeamId: orgTeam.id, staffMemberId },
        });
      }
    }

    for (let index = 0; index < data.tasks.length; index += 1) {
      const task = data.tasks[index];
      const projectId = projectIdByName.get(task.team);
      if (!projectId) {
        throw new Error(`Task "${task.title}" references unknown project "${task.team}".`);
      }

      const owners = normalizeOwners(task.owners ?? task.owner);

      await tx.task.create({
        data: {
          id: task.id,
          workspaceId,
          projectId,
          title: task.title,
          description: task.description ?? "",
          priority: task.priority === "High" ? "High" : "Low",
          due: task.due ?? "",
          status: TASK_STATUS_TO_DB[toTaskStatusLabel(task.status)],
          sortOrder: index,
          owners: {
            create: owners.map((ownerName, ownerIndex) => {
              const staffMemberId = staffIdByName.get(ownerName);
              if (!staffMemberId) {
                throw new Error(
                  `Task "${task.title}" references unknown owner "${ownerName}".`,
                );
              }
              return { staffMemberId, sortOrder: ownerIndex };
            }),
          },
          updates: {
            create: (task.updates ?? []).map((update) => ({
              id: update.id ?? randomUUID(),
              text: update.text,
              createdAt: new Date(update.createdAt),
            })),
          },
        },
      });
    }

    for (const deletedTask of data.deletedTasks) {
      await tx.deletedTask.create({
        data: {
          trashId: deletedTask.trashId,
          workspaceId,
          previousStatus: deletedTask.previousStatus,
          deletedAt: new Date(deletedTask.deletedAt),
          payload: deletedTask as Prisma.InputJsonValue,
        },
      });
    }

    for (const archivedTask of data.archivedTasks) {
      await tx.archivedTask.create({
        data: {
          archivedId: archivedTask.archivedId,
          workspaceId,
          archivedAt: new Date(archivedTask.archivedAt),
          payload: archivedTask as Prisma.InputJsonValue,
        },
      });
    }

    for (const event of data.schedule.events) {
      const projectId = event.project
        ? (projectIdByName.get(event.project) ?? null)
        : null;

      await tx.scheduleEvent.create({
        data: {
          id: event.id,
          workspaceId,
          projectId,
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          allDay: Boolean(event.allDay),
          description: event.description ?? "",
          location: event.location ?? "",
          color: event.color,
          guests: {
            create: (event.guests ?? [])
              .map((guestName) => staffIdByName.get(guestName))
              .filter((staffMemberId): staffMemberId is string => Boolean(staffMemberId))
              .map((staffMemberId) => ({ staffMemberId })),
          },
        },
      });
    }

    for (const [roleLabel, actions] of Object.entries(data.permissionMatrix)) {
      const role = PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(roleLabel)];
      for (const [actionId, allowed] of Object.entries(actions)) {
        await tx.permissionRule.create({
          data: { workspaceId, role, actionId, allowed: Boolean(allowed) },
        });
      }
    }
  }, { timeout: 60_000 });
}

export async function syncLegacyWorkspaceDataBySlug(
  slug: string,
  data: WorkspaceData,
): Promise<void> {
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    create: { slug, name: "Company Task Tracker" },
    update: { name: "Company Task Tracker" },
  });

  await syncLegacyWorkspaceData(workspace.id, data);

  // Remove login accounts left behind when staff were deleted from the workspace.
  await prisma.user.deleteMany({
    where: { staffMember: null },
  });
}
