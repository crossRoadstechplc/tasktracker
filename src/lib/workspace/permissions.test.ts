import { describe, expect, it } from "vitest";
import type { WorkspaceData } from "@/src/types/workspace";
import { applyPermittedWorkspaceUpdate, can } from "@/src/lib/workspace/permissions";

function workspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  const base: WorkspaceData = {
    tasks: [
      {
        id: "task-1",
        title: "Original title",
        team: "Operations",
        owner: "Ada",
        owners: ["Ada"],
        priority: "Low",
        due: "",
        status: "To Do",
        updates: [],
      },
    ],
    teams: ["Operations"],
    deletedTasks: [],
    archivedTasks: [],
    staff: ["Ada", "Ben"],
    staffProfiles: {
      Ada: {
        firstName: "Ada",
        lastName: "",
        role: "Lead",
        permissionRole: "Super Admin",
      },
      Ben: {
        firstName: "Ben",
        lastName: "",
        role: "",
        permissionRole: "Junior Staff",
      },
    },
    teamMembers: { Operations: ["Ada"] },
    teamLeaders: { Operations: "Ada" },
    orgTeams: ["Ops"],
    orgTeamMembers: { Ops: ["Ada"] },
    schedule: { events: [] },
    permissionMatrix: {
      "Super Admin": { "settings.editPermissions": true, "backup.import": true },
      Admin: { "settings.editPermissions": true, "backup.import": true },
      Lead: {},
      "Senior Staff": {},
      "Junior Staff": {
        "tasks.move": true,
        "tasks.addUpdate": true,
      },
    },
  };

  return {
    ...base,
    ...overrides,
    staffProfiles: overrides.staffProfiles ?? base.staffProfiles,
    permissionMatrix: overrides.permissionMatrix ?? base.permissionMatrix,
    schedule: overrides.schedule ?? base.schedule,
  };
}

describe("can()", () => {
  it("always allows Super Admin", () => {
    const data = workspace();
    expect(can("Super Admin", "settings.editPermissions", data.permissionMatrix)).toBe(true);
    expect(can("Junior Staff", "settings.editPermissions", data.permissionMatrix)).toBe(false);
  });
});

describe("applyPermittedWorkspaceUpdate", () => {
  it("blocks junior staff from granting themselves Super Admin", () => {
    const existing = workspace();
    const incoming = workspace({
      staffProfiles: {
        ...existing.staffProfiles,
        Ben: { ...existing.staffProfiles.Ben, permissionRole: "Super Admin" },
      },
      permissionMatrix: {
        ...existing.permissionMatrix,
        "Junior Staff": {
          "settings.editPermissions": true,
          "backup.import": true,
          "staff.assignRole": true,
        },
      },
    });

    const merged = applyPermittedWorkspaceUpdate({
      existing,
      incoming,
      role: "Junior Staff",
      actorDisplayName: "Ben",
    });

    expect(merged.staffProfiles.Ben.permissionRole).toBe("Junior Staff");
    expect(merged.permissionMatrix["Junior Staff"]["settings.editPermissions"]).toBeUndefined();
  });

  it("lets junior staff move a task and add an update without editing the title", () => {
    const existing = workspace();
    const incoming = workspace({
      tasks: [
        {
          ...existing.tasks[0],
          title: "Hacked title",
          status: "In Progress",
          updates: [{ id: "u1", text: "Started", createdAt: "2026-08-31T00:00:00.000Z" }],
        },
      ],
    });

    const merged = applyPermittedWorkspaceUpdate({
      existing,
      incoming,
      role: "Junior Staff",
      actorDisplayName: "Ben",
    });

    expect(merged.tasks[0].title).toBe("Original title");
    expect(merged.tasks[0].status).toBe("In Progress");
    expect(merged.tasks[0].updates).toHaveLength(1);
  });

  it("keeps the last Super Admin if an import tries to remove them", () => {
    const existing = workspace();
    const incoming = workspace({
      staff: ["Ben"],
      staffProfiles: {
        Ben: existing.staffProfiles.Ben,
      },
    });

    const merged = applyPermittedWorkspaceUpdate({
      existing,
      incoming,
      role: "Admin",
      actorDisplayName: "Ben",
    });

    expect(merged.staff).toContain("Ada");
    expect(merged.staffProfiles.Ada.permissionRole).toBe("Super Admin");
  });
});
