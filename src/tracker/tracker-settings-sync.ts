/** Incremental API sync for projects, org teams, and staff profile edits. */

export type SettingsSyncContext = {
  getProjectIds: () => Record<string, string>;
  setProjectIds: (ids: Record<string, string>) => void;
  getOrgTeamIds: () => Record<string, string>;
  setOrgTeamIds: (ids: Record<string, string>) => void;
  getStaffIds: () => Record<string, string>;
  setStaffIds: (ids: Record<string, string>) => void;
  getTeamMembers: () => Record<string, string[]>;
  getTeamLeaders: () => Record<string, string>;
  getOrgTeamMembers: () => Record<string, string[]>;
  setBackupStatus: (message: string, isError?: boolean) => void;
};

const SYNC_MS = 350;

export function createSettingsSync(ctx: SettingsSyncContext) {
  const clientId = crypto.randomUUID();
  let projectMembersTimer: ReturnType<typeof setTimeout> | null = null;
  let projectLeaderTimer: ReturnType<typeof setTimeout> | null = null;
  let orgTeamMembersTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingProjectMembers: string | null = null;
  let pendingProjectLeader: string | null = null;
  let pendingOrgTeamMembers: string | null = null;
  const projectMembersSyncLocks = new Map<string, Promise<void>>();

  async function withProjectMembersSyncLock<T>(
    projectName: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = projectMembersSyncLocks.get(projectName) ?? Promise.resolve();
    let releaseLock!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    projectMembersSyncLocks.set(projectName, queued);

    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      releaseLock();
      if (projectMembersSyncLocks.get(projectName) === queued) {
        projectMembersSyncLocks.delete(projectName);
      }
    }
  }

  async function apiFetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    headers.set("x-client-id", clientId);

    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });

    if (response.status === 401) {
      window.location.replace("/login");
      throw new Error("Session expired.");
    }

    return response;
  }

  function staffIdsFromNames(names: string[]) {
    const staffIds = ctx.getStaffIds();
    const ids = names
      .map((name) => staffIds[name])
      .filter((id): id is string => Boolean(id));
    return [...new Set(ids)];
  }

  function unresolvedStaffNames(names: string[]) {
    const staffIds = ctx.getStaffIds();
    return names.filter((name) => !staffIds[name]);
  }

  function assertProjectSyncReady(projectName: string) {
    const projectId = ctx.getProjectIds()[projectName];
    if (!projectId) {
      throw new Error("Could not save — project id missing. Refresh and try again.");
    }

    const memberNames = ctx.getTeamMembers()[projectName] ?? [];
    const unresolvedMembers = unresolvedStaffNames(memberNames);
    if (unresolvedMembers.length) {
      const label = unresolvedMembers.join(", ");
      throw new Error(
        `Could not save — ${label} ${unresolvedMembers.length === 1 ? "is" : "are"} not fully invited yet.`,
      );
    }

    const leaderName = ctx.getTeamLeaders()[projectName] ?? "";
    if (leaderName && !ctx.getStaffIds()[leaderName]) {
      throw new Error(
        `Could not save — project leader "${leaderName}" is not fully invited yet.`,
      );
    }

    return projectId;
  }

  function cancelProjectMembersSync() {
    if (projectMembersTimer) {
      clearTimeout(projectMembersTimer);
      projectMembersTimer = null;
    }
    pendingProjectMembers = null;
  }

  function cancelProjectLeaderSync() {
    if (projectLeaderTimer) {
      clearTimeout(projectLeaderTimer);
      projectLeaderTimer = null;
    }
    pendingProjectLeader = null;
  }

  function renameIdKey(
    map: Record<string, string>,
    oldName: string,
    newName: string,
  ) {
    if (map[oldName]) {
      map[newName] = map[oldName];
      delete map[oldName];
    }
  }

  async function createProject(name: string) {
    const response = await apiFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Create project failed (${response.status}).`);
    }
    const body = (await response.json()) as { id: string; name: string };
    const projectIds = { ...ctx.getProjectIds(), [body.name]: body.id };
    ctx.setProjectIds(projectIds);
    ctx.setBackupStatus("Project saved.");
    return body;
  }

  async function renameProject(oldName: string, newName: string) {
    const projectId = ctx.getProjectIds()[oldName];
    if (!projectId) throw new Error("Project id not found.");

    const response = await apiFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: newName }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Rename project failed (${response.status}).`);
    }

    const projectIds = { ...ctx.getProjectIds() };
    renameIdKey(projectIds, oldName, newName);
    ctx.setProjectIds(projectIds);
    ctx.setBackupStatus("Project saved.");
  }

  async function deleteProject(name: string) {
    const projectId = ctx.getProjectIds()[name];
    if (!projectId) throw new Error("Project id not found.");

    const response = await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Delete project failed (${response.status}).`);
    }

    const projectIds = { ...ctx.getProjectIds() };
    delete projectIds[name];
    ctx.setProjectIds(projectIds);
    ctx.setBackupStatus("Project removed.");
  }

  async function syncProjectMembersNow(
    projectName: string,
    options: { quiet?: boolean } = {},
  ) {
    return withProjectMembersSyncLock(projectName, async () => {
      const projectId = assertProjectSyncReady(projectName);
      const memberNames = ctx.getTeamMembers()[projectName] ?? [];

      const response = await apiFetch(`/api/projects/${projectId}/members`, {
        method: "PUT",
        body: JSON.stringify({ memberIds: staffIdsFromNames(memberNames) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Save project members failed (${response.status}).`);
      }
      if (!options.quiet) {
        ctx.setBackupStatus("Project members saved.");
      }
    });
  }

  async function syncProjectLeaderNow(
    projectName: string,
    options: { quiet?: boolean } = {},
  ) {
    const projectId = assertProjectSyncReady(projectName);
    const leaderName = ctx.getTeamLeaders()[projectName] ?? "";
    const staffIds = ctx.getStaffIds();
    const leaderId = leaderName && staffIds[leaderName] ? staffIds[leaderName] : null;

    const response = await apiFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ leaderId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Save project leader failed (${response.status}).`);
    }
    if (!options.quiet) {
      ctx.setBackupStatus("Project leader saved.");
    }
  }

  async function flushProjectConfigSync(projectName: string) {
    cancelProjectMembersSync();
    cancelProjectLeaderSync();
    await syncProjectMembersNow(projectName, { quiet: true });
    await syncProjectLeaderNow(projectName, { quiet: true });
    ctx.setBackupStatus("Project saved.");
  }

  function scheduleProjectMembersSync(projectName: string) {
    pendingProjectMembers = projectName;
    if (projectMembersTimer) clearTimeout(projectMembersTimer);
    projectMembersTimer = setTimeout(() => {
      const name = pendingProjectMembers;
      pendingProjectMembers = null;
      if (!name) return;
      void syncProjectMembersNow(name).catch((error) => {
        console.error("Project members sync failed.", error);
        ctx.setBackupStatus(
          error instanceof Error ? error.message : "Could not save project members.",
          true,
        );
      });
    }, SYNC_MS);
  }

  function scheduleProjectLeaderSync(projectName: string) {
    pendingProjectLeader = projectName;
    if (projectLeaderTimer) clearTimeout(projectLeaderTimer);
    projectLeaderTimer = setTimeout(() => {
      const name = pendingProjectLeader;
      pendingProjectLeader = null;
      if (!name) return;
      void syncProjectLeaderNow(name).catch((error) => {
        console.error("Project leader sync failed.", error);
        ctx.setBackupStatus(
          error instanceof Error ? error.message : "Could not save project leader.",
          true,
        );
      });
    }, SYNC_MS);
  }

  async function createOrgTeam(name: string) {
    const response = await apiFetch("/api/org-teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Create team failed (${response.status}).`);
    }
    const body = (await response.json()) as { id: string; name: string };
    const orgTeamIds = { ...ctx.getOrgTeamIds(), [body.name]: body.id };
    ctx.setOrgTeamIds(orgTeamIds);
    ctx.setBackupStatus("Team saved.");
    return body;
  }

  async function renameOrgTeam(oldName: string, newName: string) {
    const orgTeamId = ctx.getOrgTeamIds()[oldName];
    if (!orgTeamId) throw new Error("Team id not found.");

    const response = await apiFetch(`/api/org-teams/${orgTeamId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: newName }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Rename team failed (${response.status}).`);
    }

    const orgTeamIds = { ...ctx.getOrgTeamIds() };
    renameIdKey(orgTeamIds, oldName, newName);
    ctx.setOrgTeamIds(orgTeamIds);
    ctx.setBackupStatus("Team saved.");
  }

  async function deleteOrgTeam(name: string) {
    const orgTeamId = ctx.getOrgTeamIds()[name];
    if (!orgTeamId) throw new Error("Team id not found.");

    const response = await apiFetch(`/api/org-teams/${orgTeamId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Delete team failed (${response.status}).`);
    }

    const orgTeamIds = { ...ctx.getOrgTeamIds() };
    delete orgTeamIds[name];
    ctx.setOrgTeamIds(orgTeamIds);
    ctx.setBackupStatus("Team removed.");
  }

  async function syncOrgTeamMembersNow(orgTeamName: string) {
    const orgTeamId = ctx.getOrgTeamIds()[orgTeamName];
    if (!orgTeamId) return;

    const memberNames = ctx.getOrgTeamMembers()[orgTeamName] ?? [];
    const response = await apiFetch(`/api/org-teams/${orgTeamId}/members`, {
      method: "PUT",
      body: JSON.stringify({ memberIds: staffIdsFromNames(memberNames) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Save team members failed (${response.status}).`);
    }
    ctx.setBackupStatus("Team members saved.");
  }

  function scheduleOrgTeamMembersSync(orgTeamName: string) {
    pendingOrgTeamMembers = orgTeamName;
    if (orgTeamMembersTimer) clearTimeout(orgTeamMembersTimer);
    orgTeamMembersTimer = setTimeout(() => {
      const name = pendingOrgTeamMembers;
      pendingOrgTeamMembers = null;
      if (!name) return;
      void syncOrgTeamMembersNow(name).catch((error) => {
        console.error("Org team members sync failed.", error);
        ctx.setBackupStatus(
          error instanceof Error ? error.message : "Could not save team members.",
          true,
        );
      });
    }, SYNC_MS);
  }

  async function updateStaffProfile(
    staffId: string,
    patch: {
      firstName: string;
      lastName: string;
      jobTitle: string;
      displayName: string;
    },
  ) {
    const response = await apiFetch(`/api/staff/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify({
        firstName: patch.firstName,
        lastName: patch.lastName,
        jobTitle: patch.jobTitle,
        displayName: patch.displayName,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Update team member failed (${response.status}).`);
    }
    ctx.setBackupStatus("Team member saved.");
  }

  async function updateStaffRole(staffId: string, permissionRole: string) {
    const response = await apiFetch(`/api/staff/${staffId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ permissionRole }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Update role failed (${response.status}).`);
    }
    ctx.setBackupStatus("Role saved.");
  }

  async function deleteStaffMember(staffId: string) {
    const response = await apiFetch(`/api/staff/${staffId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Remove team member failed (${response.status}).`);
    }
    ctx.setBackupStatus("Team member removed.");
  }

  function renameStaffId(oldName: string, newName: string) {
    const staffIds = { ...ctx.getStaffIds() };
    renameIdKey(staffIds, oldName, newName);
    ctx.setStaffIds(staffIds);
  }

  function removeStaffId(name: string) {
    const staffIds = { ...ctx.getStaffIds() };
    delete staffIds[name];
    ctx.setStaffIds(staffIds);
  }

  function registerStaffId(displayName: string, id: string) {
    ctx.setStaffIds({ ...ctx.getStaffIds(), [displayName]: id });
  }

  return {
    createProject,
    renameProject,
    deleteProject,
    scheduleProjectMembersSync,
    scheduleProjectLeaderSync,
    flushProjectConfigSync,
    createOrgTeam,
    renameOrgTeam,
    deleteOrgTeam,
    scheduleOrgTeamMembersSync,
    updateStaffProfile,
    updateStaffRole,
    deleteStaffMember,
    renameStaffId,
    removeStaffId,
    registerStaffId,
  };
}
