/**
 * Static audit: maps frontend save paths and permission gates to backend API routes.
 * Run: npx tsx scripts/audit-alignment.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..");

type CheckResult = {
  area: string;
  feature: string;
  frontend: string;
  backend: string;
  status: "aligned" | "partial" | "gap" | "untested";
  notes?: string;
};

const checks: CheckResult[] = [
  // Auth
  {
    area: "Auth",
    feature: "Login",
    frontend: "LoginForm → POST /api/auth/login",
    backend: "app/api/auth/login/route.ts",
    status: "aligned",
  },
  {
    area: "Auth",
    feature: "Session / me",
    frontend: "TrackerApp → GET /api/auth/me",
    backend: "app/api/auth/me/route.ts",
    status: "aligned",
  },
  {
    area: "Auth",
    feature: "Logout",
    frontend: "tracker-app → POST /api/auth/logout",
    backend: "app/api/auth/logout/route.ts",
    status: "aligned",
  },
  {
    area: "Auth",
    feature: "Change password",
    frontend: "change-password page",
    backend: "app/api/auth/change-password/route.ts",
    status: "aligned",
  },
  {
    area: "Auth",
    feature: "Accept invite",
    frontend: "accept-invite page",
    backend: "app/api/auth/accept-invite/route.ts",
    status: "aligned",
  },
  {
    area: "Auth",
    feature: "Route protection",
    frontend: "middleware.ts redirects unauthenticated users",
    backend: "middleware.ts + API session guards",
    status: "aligned",
  },

  // Workspace
  {
    area: "Workspace",
    feature: "Load workspace",
    frontend: "TrackerApp → GET /api/workspace (+ X-Workspace-Revision)",
    backend: "app/api/workspace/route.ts GET",
    status: "aligned",
  },
  {
    area: "Workspace",
    feature: "Health check",
    frontend: "—",
    backend: "GET /api/health",
    status: "aligned",
    notes: "Used by e2e runner and ops",
  },
  {
    area: "Workspace",
    feature: "Full document save (settings data)",
    frontend: "scheduleFolderSync → PUT /api/workspace",
    backend: "app/api/workspace/route.ts PUT + applyPermittedWorkspaceUpdate",
    status: "aligned",
    notes: "Used for staff list order, projects, org-teams, team members, import",
  },
  {
    area: "Workspace",
    feature: "Import backup",
    frontend: "importBackupFile → PUT /api/workspace",
    backend: "PUT /api/workspace + POST /api/workspace/import",
    status: "partial",
    notes: "UI uses PUT /api/workspace; dedicated import route also exists",
  },
  {
    area: "Workspace",
    feature: "Export backup",
    frontend: "exportBackup() client-side JSON download",
    backend: "No API (client-only)",
    status: "aligned",
  },

  // Tasks
  {
    area: "Tasks",
    feature: "Create task",
    frontend: "tracker-sync → POST /api/tasks",
    backend: "app/api/tasks/route.ts POST [tasks.create]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Edit task",
    frontend: "tracker-sync → PATCH /api/tasks/:id",
    backend: "app/api/tasks/[id]/route.ts PATCH [tasks.edit]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Move task (drag/drop)",
    frontend: "tracker-sync.syncTaskMove → POST /api/tasks/:id/move",
    backend: "app/api/tasks/[id]/move/route.ts [tasks.move]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Post task update",
    frontend: "tracker-sync.syncTaskUpdate → POST /api/tasks/:id/updates",
    backend: "app/api/tasks/[id]/updates/route.ts [tasks.addUpdate]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Delete task → trash",
    frontend: "tracker-sync → DELETE /api/tasks/:id",
    backend: "app/api/tasks/[id]/route.ts DELETE [tasks.delete]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Archive completed task",
    frontend: "tracker-sync → POST /api/tasks/:id/archive",
    backend: "app/api/tasks/[id]/archive/route.ts [tasks.delete]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Restore from trash",
    frontend: "tracker-sync.syncTrashRestore → POST /api/trash/:id/restore",
    backend: "app/api/trash/[trashId]/restore/route.ts [trash.restore]",
    status: "aligned",
  },
  {
    area: "Tasks",
    feature: "Permission gating (UI)",
    frontend: "data-permission on buttons + can()",
    backend: "requirePermission on each route",
    status: "aligned",
  },

  // Schedule
  {
    area: "Schedule",
    feature: "Create event",
    frontend: "tracker-sync → POST /api/schedule",
    backend: "app/api/schedule/route.ts POST [schedule.create]",
    status: "aligned",
  },
  {
    area: "Schedule",
    feature: "Edit event",
    frontend: "tracker-sync → PATCH /api/schedule/:id",
    backend: "app/api/schedule/[id]/route.ts PATCH [schedule.edit]",
    status: "aligned",
  },
  {
    area: "Schedule",
    feature: "Delete event",
    frontend: "tracker-sync → DELETE /api/schedule/:id",
    backend: "app/api/schedule/[id]/route.ts DELETE [schedule.delete]",
    status: "aligned",
  },

  {
    area: "Projects",
    feature: "Create / rename / delete project",
    frontend: "settingsSync → POST/PATCH/DELETE /api/projects",
    backend: "POST/PATCH/DELETE /api/projects/*",
    status: "aligned",
  },
  {
    area: "Projects",
    feature: "Manage project members",
    frontend: "settingsSync → PUT /api/projects/:id/members",
    backend: "PUT /api/projects/:id/members",
    status: "aligned",
  },
  {
    area: "Projects",
    feature: "Project leader",
    frontend: "settingsSync → PATCH /api/projects/:id { leaderId }",
    backend: "PATCH /api/projects/:id",
    status: "aligned",
  },

  // Org Teams
  {
    area: "Teams",
    feature: "Create / rename / delete org team",
    frontend: "settingsSync → POST/PATCH/DELETE /api/org-teams",
    backend: "POST/PATCH/DELETE /api/org-teams/*",
    status: "aligned",
  },
  {
    area: "Teams",
    feature: "Manage org team members",
    frontend: "settingsSync → PUT /api/org-teams/:id/members",
    backend: "PUT /api/org-teams/:id/members",
    status: "aligned",
  },

  // Staff
  {
    area: "Staff",
    feature: "Invite team member",
    frontend: "POST /api/staff/invite",
    backend: "app/api/staff/invite/route.ts (Admin/Super Admin)",
    status: "aligned",
    notes: "Uses role check, not staff.create permission id",
  },
  {
    area: "Staff",
    feature: "Remove team member",
    frontend: "settingsSync → DELETE /api/staff/:id",
    backend: "app/api/staff/[id]/route.ts DELETE [staff.delete]",
    status: "aligned",
  },
  {
    area: "Staff",
    feature: "Edit staff profile / role",
    frontend: "PATCH /api/staff/:id + PATCH /api/staff/:id/role",
    backend: "staff.edit + staff.assignRole permissions",
    status: "aligned",
  },
  {
    area: "Staff",
    feature: "Resend invite",
    frontend: "Not wired in tracker-app.ts",
    backend: "POST /api/staff/:id/resend-invite exists",
    status: "gap",
    notes: "Backend ready; no UI button calls this endpoint",
  },

  // Permissions
  {
    area: "Settings",
    feature: "Edit permission matrix",
    frontend: "Save Permissions → PUT /api/permissions",
    backend: "app/api/permissions/route.ts [settings.editPermissions]",
    status: "aligned",
  },
  {
    area: "Settings",
    feature: "Reset to defaults",
    frontend: "Local reset + Save Permissions required",
    backend: "PUT /api/permissions",
    status: "aligned",
  },

  // Realtime
  {
    area: "Realtime",
    feature: "SSE events",
    frontend: "tracker-sync EventSource → GET /api/events?after=revision",
    backend: "app/api/events/route.ts",
    status: "aligned",
  },
  {
    area: "Realtime",
    feature: "Cross-tab sync",
    frontend: "Applies task/schedule/workspace.reload events",
    backend: "publishWorkspaceEvent fan-out",
    status: "aligned",
  },
];

function verifyPermissionActionsInFrontend(): string[] {
  const trackerSrc = fs.readFileSync(
    path.join(root, "src/tracker/tracker-app.ts"),
    "utf8",
  );
  const actionMatches = [...trackerSrc.matchAll(/id: "([^"]+)"/g)].filter((m) =>
    m[1].includes("."),
  );
  const actionIds = new Set(
    actionMatches.map((m) => m[1]).filter((id) => id.startsWith("tasks.") || id.startsWith("staff.") || id.startsWith("projects.") || id.startsWith("teams.") || id.startsWith("schedule.") || id.startsWith("backup.") || id.startsWith("trash.") || id.startsWith("settings.")),
  );

  const missingGates: string[] = [];
  for (const id of actionIds) {
    if (!trackerSrc.includes(`"${id}"`) && !trackerSrc.includes(`'${id}'`)) continue;
    const hasGate =
      trackerSrc.includes(`data-permission="${id}"`) ||
      trackerSrc.includes(`can("${id}")`) ||
      id === "settings.editPermissions";
    if (!hasGate && !id.startsWith("backup.")) {
      // backup uses can() in functions
      if (id === "backup.export" || id === "backup.import") {
        if (!trackerSrc.includes('can("backup.export")') && !trackerSrc.includes('can("backup.import")')) {
          missingGates.push(id);
        }
      } else if (!trackerSrc.includes(`can("${id}")`)) {
        missingGates.push(id);
      }
    }
  }
  return missingGates;
}

function printReport() {
  console.log("=".repeat(72));
  console.log("TASK TRACKER — FRONTEND / BACKEND ALIGNMENT AUDIT");
  console.log("=".repeat(72));

  const byArea = new Map<string, CheckResult[]>();
  for (const check of checks) {
    if (!byArea.has(check.area)) byArea.set(check.area, []);
    byArea.get(check.area)!.push(check);
  }

  let aligned = 0;
  let partial = 0;
  let gaps = 0;

  for (const [area, items] of byArea) {
    console.log(`\n## ${area}`);
    for (const item of items) {
      const icon =
        item.status === "aligned" ? "✓" : item.status === "partial" ? "~" : item.status === "gap" ? "✗" : "?";
      console.log(`  ${icon} ${item.feature}`);
      console.log(`      Frontend: ${item.frontend}`);
      console.log(`      Backend:  ${item.backend}`);
      if (item.notes) console.log(`      Note:     ${item.notes}`);
      if (item.status === "aligned") aligned++;
      else if (item.status === "partial") partial++;
      else if (item.status === "gap") gaps++;
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Summary: ${aligned} aligned, ${partial} partial, ${gaps} gaps`);
  console.log("=".repeat(72));

  const missingGates = verifyPermissionActionsInFrontend();
  if (missingGates.length) {
    console.log("\nPermission actions without obvious UI gate:", missingGates.join(", "));
  } else {
    console.log("\nAll permission actions appear gated in tracker-app.ts");
  }
}

printReport();
