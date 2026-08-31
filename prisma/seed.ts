import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { TrackerBackup } from "../src/types/workspace";
import { seedAuthUsers } from "../src/lib/auth/seed-users";
import { prisma } from "../src/lib/prisma";
import { getTrackerBackupPath } from "../src/lib/workspace/backup-path";
import { DEFAULT_WORKSPACE_SLUG } from "../src/lib/workspace/roles";
import { syncLegacyWorkspaceDataBySlug } from "../src/lib/workspace/sync";

function loadBackup(): TrackerBackup {
  const raw = readFileSync(getTrackerBackupPath(path.resolve(__dirname, "..")), "utf8");
  const backup = JSON.parse(raw) as TrackerBackup;

  if (backup.app !== "company-task-tracker") {
    throw new Error("Invalid backup app identifier.");
  }
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  return backup;
}

async function main() {
  const backup = loadBackup();
  await syncLegacyWorkspaceDataBySlug(DEFAULT_WORKSPACE_SLUG, backup.data);
  console.log(`Seeded workspace from ${getTrackerBackupPath(path.resolve(__dirname, ".."))}`);
  await seedAuthUsers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
