import { hashPassword } from "../../src/lib/auth/password";
import { prisma } from "../../src/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "../../src/lib/workspace/roles";

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "ChangeMe123!";
export const E2E_SUPER_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "e2e-super@tracker.local";
export const E2E_JUNIOR_EMAIL =
  process.env.E2E_JUNIOR_EMAIL ?? "e2e-junior@tracker.local";
export const E2E_SUPER_NAME = "E2E Super";
export const E2E_JUNIOR_NAME = "E2E Junior";

async function upsertE2eUser(input: {
  email: string;
  displayName: string;
  firstName: string;
  permissionRole: "SUPER_ADMIN" | "JUNIOR_STAFF";
  sortOrder: number;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });
  if (!workspace) {
    throw new Error("Default workspace missing. Run db:seed first.");
  }

  const passwordHash = await hashPassword(E2E_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      passwordHash,
      mustChangePassword: false,
    },
    update: {
      passwordHash,
      mustChangePassword: false,
    },
  });

  const existingStaff = await prisma.staffMember.findUnique({
    where: {
      workspaceId_displayName: {
        workspaceId: workspace.id,
        displayName: input.displayName,
      },
    },
  });

  if (existingStaff) {
    await prisma.staffMember.update({
      where: { id: existingStaff.id },
      data: {
        userId: user.id,
        permissionRole: input.permissionRole,
        firstName: input.firstName,
        sortOrder: input.sortOrder,
      },
    });
    return;
  }

  await prisma.staffMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      displayName: input.displayName,
      firstName: input.firstName,
      lastName: "",
      permissionRole: input.permissionRole,
      sortOrder: input.sortOrder,
    },
  });
}

export async function ensureE2eUsers(): Promise<void> {
  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_JUNIOR_EMAIL) {
    return;
  }

  const maxSort = await prisma.staffMember.aggregate({
    _max: { sortOrder: true },
  });
  const baseSort = (maxSort._max.sortOrder ?? 0) + 100;

  await upsertE2eUser({
    email: E2E_SUPER_EMAIL,
    displayName: E2E_SUPER_NAME,
    firstName: "E2E",
    permissionRole: "SUPER_ADMIN",
    sortOrder: baseSort,
  });

  await upsertE2eUser({
    email: E2E_JUNIOR_EMAIL,
    displayName: E2E_JUNIOR_NAME,
    firstName: "E2E",
    permissionRole: "JUNIOR_STAFF",
    sortOrder: baseSort + 1,
  });
}

export async function disconnectE2eDb(): Promise<void> {
  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureE2eUsers()
    .then(() => console.log("E2E users ready."))
    .catch(console.error)
    .finally(() => disconnectE2eDb());
}
