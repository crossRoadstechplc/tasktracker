import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(__dirname, "../src/tracker");
let js = fs.readFileSync(path.join(base, "tracker-app.patched.js"), "utf8");

const initStart = js.indexOf("async function initializeFolderPersistence()");
const initEnd = js.indexOf("function exportBackup()", initStart);
const newInit = `async function initializeFolderPersistence() {
      folderPersistenceReady = true;
      setBackupStatus("Auto-save to database is on.");
      if (folderSyncPending) {
        folderSyncPending = false;
        scheduleFolderSync();
      }
    }

    `;
js = js.slice(0, initStart) + newInit + js.slice(initEnd);

js = js.replace('setBackupStatus("Saved to local data folder.")', 'setBackupStatus("Saved to database.")');
js = js.replace(
  "Could not save tracker data to the local folder.",
  "Could not save tracker data to the database.",
);
js = js.replace(
  "Local folder auto-save failed. Export a backup for safety.",
  "Database auto-save failed. Export a backup for safety.",
);

const insertMarker = "    };\n    const LAST_MODIFIED_STORAGE_KEY";
const preloadFn = `    };
    const LAST_MODIFIED_STORAGE_KEY = "taskTrackerLastModified";

    function applyPreloadedWorkspace(data) {
      if (!data) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.tasks ?? []));
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(data.teams ?? []));
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(data.deletedTasks ?? []));
      localStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(data.archivedTasks ?? []));
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(data.staff ?? []));
      localStorage.setItem(STAFF_PROFILES_STORAGE_KEY, JSON.stringify(data.staffProfiles ?? {}));
      localStorage.setItem(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(data.teamMembers ?? {}));
      localStorage.setItem(TEAM_LEADERS_STORAGE_KEY, JSON.stringify(data.teamLeaders ?? {}));
      localStorage.setItem(ORG_TEAMS_STORAGE_KEY, JSON.stringify(data.orgTeams ?? []));
      localStorage.setItem(ORG_TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(data.orgTeamMembers ?? {}));
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(data.schedule ?? { events: [] }));
      localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(data.permissionMatrix ?? {}));
      localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
    }

    applyPreloadedWorkspace(preloadData);
`;

if (!js.includes("function applyPreloadedWorkspace")) {
  js = js.replace(insertMarker, preloadFn);
}

const header = `// @ts-nocheck
/** Ported from SPX TASK TRACKER/index.html — persistence wired to /api/workspace. */
import type { WorkspaceData } from "@/src/types/workspace";

export type TrackerInitOptions = {
  preloadData?: WorkspaceData;
};

export function initTrackerApp(options: TrackerInitOptions = {}) {
  const preloadData = options.preloadData;

`;

const applyCallMarker = "    }\n\n    const LAST_MODIFIED_STORAGE_KEY = \"taskTrackerLastModified\";\n      // Captured";
const applyCallReplacement = `    }

    applyPreloadedWorkspace(preloadData);

      // Captured`;

if (js.includes(applyCallMarker)) {
  js = js.replace(applyCallMarker, applyCallReplacement);
}

const body = js
  .split("\n")
  .map((line) => (line ? `  ${line}` : line))
  .join("\n");
const out = `${header}${body}\n}\n`;

fs.writeFileSync(path.join(base, "tracker-app.ts"), out, "utf8");
console.log(`Wrote tracker-app.ts (${out.length} chars)`);
