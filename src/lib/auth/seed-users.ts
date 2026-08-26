import { hashPassword } from "@/src/lib/auth/password";
import { prisma } from "@/src/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";

export const DEFAULT_SEED_PASSWORD = "ChangeMe123!";

export function emailForDisplayName(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return `${slug || "user"}@tracker.local`;
}

export async function seedAuthUsers(
  password = DEFAULT_SEED_PASSWORD,
): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });

  if (!workspace) {
    throw new Error("Workspace must be seeded before auth users.");
  }

  const staffMembers = await prisma.staffMember.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { sortOrder: "asc" },
  });

  const passwordHash = await hashPassword(password);

  for (const member of staffMembers) {
    const email = emailForDisplayName(member.displayName);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
      },
      update: {
        passwordHash,
      },
    });

    await prisma.staffMember.update({
      where: { id: member.id },
      data: { userId: user.id },
    });
  }

  console.log(`Seeded ${staffMembers.length} auth users (password: ${password})`);
}
