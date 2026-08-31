import { getWorkspaceBySlug } from "@/src/lib/workspace/mapper";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";
import { prisma } from "@/src/lib/prisma";

export async function getDefaultWorkspace() {
  const workspace = await getWorkspaceBySlug(DEFAULT_WORKSPACE_SLUG);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  return workspace;
}

export async function getStaffIdByDisplayName(
  workspaceId: string,
  displayName: string,
): Promise<string | null> {
  const member = await prisma.staffMember.findUnique({
    where: {
      workspaceId_displayName: { workspaceId, displayName },
    },
    select: { id: true },
  });
  return member?.id ?? null;
}

export async function getProjectIdByName(
  workspaceId: string,
  name: string,
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: {
      workspaceId_name: { workspaceId, name },
    },
    select: { id: true },
  });
  return project?.id ?? null;
}

export async function buildStaffDisplayNameMap(workspaceId: string) {
  const members = await prisma.staffMember.findMany({
    where: { workspaceId },
    select: { id: true, displayName: true },
  });
  const idToName = new Map(members.map((m) => [m.id, m.displayName]));
  const nameToId = new Map(members.map((m) => [m.displayName, m.id]));
  return { idToName, nameToId };
}
