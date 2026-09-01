import { describe, expect, it } from "vitest";
import {
  canSeeAllProjects,
  ForbiddenError,
  getAccessibleProjectIds,
  mergeScheduleRecipientIds,
} from "@/src/lib/workspace/visibility";

async function canConnectToDatabase() {
  try {
    const { prisma } = await import("@/src/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe("workspace visibility", () => {
  it("grants global visibility to Super Admin and Admin only", () => {
    expect(canSeeAllProjects("Super Admin")).toBe(true);
    expect(canSeeAllProjects("Admin")).toBe(true);
    expect(canSeeAllProjects("Lead")).toBe(false);
    expect(canSeeAllProjects("Senior Staff")).toBe(false);
    expect(canSeeAllProjects("Junior Staff")).toBe(false);
  });

  it("exposes ForbiddenError for access denials", () => {
    const error = new ForbiddenError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Forbidden.");
  });

  it("merges project members and guests without duplicates", () => {
    expect(mergeScheduleRecipientIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeScheduleRecipientIds([], ["guest"])).toEqual(["guest"]);
    expect(mergeScheduleRecipientIds(["member"], [])).toEqual(["member"]);
  });
});

describe("getAccessibleProjectIds", () => {
  it("returns null for admin roles", async () => {
    const hasDatabase = await canConnectToDatabase();
    if (!hasDatabase) {
      console.warn("Skipping DB-backed visibility test: PostgreSQL is unavailable.");
      return;
    }

    const { prisma } = await import("@/src/lib/prisma");
    const workspace = await prisma.workspace.findUnique({ where: { slug: "default" } });
    if (!workspace) {
      console.warn("Skipping DB-backed visibility test: default workspace missing.");
      return;
    }

    const adminStaff = await prisma.staffMember.findFirst({
      where: { workspaceId: workspace.id, permissionRole: "SUPER_ADMIN" },
      select: { id: true },
    });
    if (!adminStaff) {
      console.warn("Skipping DB-backed visibility test: no super admin staff.");
      return;
    }

    const accessible = await getAccessibleProjectIds(
      workspace.id,
      adminStaff.id,
      "Super Admin",
    );
    expect(accessible).toBeNull();

    await prisma.$disconnect();
  });
});
