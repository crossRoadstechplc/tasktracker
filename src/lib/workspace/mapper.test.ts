import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTrackerBackupPath } from "@/src/lib/workspace/backup-path";
import {
  PERMISSION_ROLE_FROM_DB,
  PERMISSION_ROLE_TO_DB,
  TASK_STATUS_FROM_DB,
  TASK_STATUS_TO_DB,
} from "@/src/lib/workspace/roles";
import type { TrackerBackup, WorkspaceData } from "@/src/types/workspace";

function loadExpectedData(): WorkspaceData {
  const backup = JSON.parse(
    readFileSync(getTrackerBackupPath(path.resolve(__dirname, "../../..")), "utf8"),
  ) as TrackerBackup;
  return backup.data;
}

async function canConnectToDatabase() {
  try {
    const { prisma } = await import("@/src/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function sortTasks(data: WorkspaceData) {
  return [...data.tasks].sort((a, b) => a.id.localeCompare(b.id));
}

describe("workspace role mapping", () => {
  it("round-trips permission roles and task statuses", () => {
    expect(PERMISSION_ROLE_FROM_DB[PERMISSION_ROLE_TO_DB["Super Admin"]]).toBe("Super Admin");
    expect(TASK_STATUS_FROM_DB[TASK_STATUS_TO_DB["In Progress"]]).toBe("In Progress");
  });
});

describe("workspace mapper parity", () => {
  it("matches seeded tracker-data.json key counts and identifiers", async () => {
    const hasDatabase = await canConnectToDatabase();
    if (!hasDatabase) {
      console.warn("Skipping DB-backed mapper test: PostgreSQL is unavailable.");
      return;
    }

    const expected = loadExpectedData();
    const { getLegacyWorkspaceDataBySlug } = await import("@/src/lib/workspace/mapper");
    const actual = await getLegacyWorkspaceDataBySlug();

    expect(actual).not.toBeNull();
    if (!actual) return;

    expect(actual.staff).toEqual(expected.staff);
    expect(actual.teams).toEqual(expected.teams);
    expect(actual.orgTeams).toEqual(expected.orgTeams);
    expect(actual.tasks).toHaveLength(expected.tasks.length);
    expect(actual.deletedTasks).toHaveLength(expected.deletedTasks.length);
    expect(actual.archivedTasks).toHaveLength(expected.archivedTasks.length);
    expect(actual.schedule.events).toHaveLength(expected.schedule.events.length);

    const actualTaskIds = sortTasks(actual).map((task) => task.id);
    const expectedTaskIds = sortTasks(expected).map((task) => task.id);
    expect(actualTaskIds).toEqual(expectedTaskIds);

    for (const role of Object.keys(expected.permissionMatrix)) {
      expect(actual.permissionMatrix[role as keyof typeof actual.permissionMatrix]).toEqual(
        expected.permissionMatrix[role as keyof typeof expected.permissionMatrix],
      );
    }

    for (const name of expected.staff) {
      expect(actual.staffProfiles[name]?.firstName).toBe(expected.staffProfiles[name].firstName);
      expect(actual.staffProfiles[name]?.lastName).toBe(expected.staffProfiles[name].lastName);
      expect(actual.staffProfiles[name]?.role).toBe(expected.staffProfiles[name].role);
      expect(actual.staffProfiles[name]?.permissionRole).toBe(
        expected.staffProfiles[name].permissionRole,
      );
    }
  });
});
