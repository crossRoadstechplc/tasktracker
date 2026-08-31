import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import { getDefaultWorkspace } from "@/src/lib/workspace/context";
import type { ActorContext } from "@/src/lib/workspace/services/tasks";

export async function createOrgTeam(input: {
  actor: ActorContext;
  name: string;
}): Promise<{ id: string; name: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const maxSort = await prisma.orgTeam.aggregate({
    where: { workspaceId: workspace.id },
    _max: { sortOrder: true },
  });

  const orgTeam = await prisma.orgTeam.create({
    data: {
      workspaceId: workspace.id,
      name: input.name.trim(),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.created",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: orgTeam.id,
    payload: { id: orgTeam.id, name: orgTeam.name },
  });

  return { id: orgTeam.id, name: orgTeam.name, revision: published.revision };
}

export async function updateOrgTeam(input: {
  actor: ActorContext;
  orgTeamId: string;
  name: string;
}): Promise<{ id: string; revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.orgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Team not found.");

  const orgTeam = await prisma.orgTeam.update({
    where: { id: input.orgTeamId },
    data: { name: input.name.trim() },
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: orgTeam.id,
    payload: { id: orgTeam.id, name: orgTeam.name },
  });

  return { id: orgTeam.id, revision: published.revision };
}

export async function deleteOrgTeam(input: {
  actor: ActorContext;
  orgTeamId: string;
}): Promise<{ revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.orgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Team not found.");

  await prisma.orgTeamMember.deleteMany({ where: { orgTeamId: input.orgTeamId } });
  await prisma.orgTeam.delete({ where: { id: input.orgTeamId } });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.deleted",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: input.orgTeamId,
    payload: { id: input.orgTeamId },
  });

  return { revision: published.revision };
}

export async function setOrgTeamMembers(input: {
  actor: ActorContext;
  orgTeamId: string;
  memberIds: string[];
}): Promise<{ revision: number }> {
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.orgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId: workspace.id },
  });
  if (!existing) throw new Error("Team not found.");

  await prisma.$transaction(async (tx) => {
    await tx.orgTeamMember.deleteMany({ where: { orgTeamId: input.orgTeamId } });
    for (const staffMemberId of input.memberIds) {
      await tx.orgTeamMember.create({
        data: { orgTeamId: input.orgTeamId, staffMemberId },
      });
    }
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: input.orgTeamId,
    payload: { id: input.orgTeamId, memberIds: input.memberIds },
  });

  return { revision: published.revision };
}
