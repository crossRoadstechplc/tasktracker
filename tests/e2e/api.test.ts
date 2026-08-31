import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiFetch,
  CookieJar,
  DEFAULT_PASSWORD,
  E2E_JUNIOR_NAME,
  JUNIOR_EMAIL,
  login,
  readSseEvent,
  SUPER_ADMIN_EMAIL,
  type WorkspaceData,
} from "./helpers";

const adminJar = new CookieJar();
const juniorJar = new CookieJar();
const listenerJar = new CookieJar();

let defaultTeam = "Unassigned";

const created = {
  taskIds: [] as string[],
  trashIds: [] as string[],
  scheduleIds: [] as string[],
  projectIds: [] as string[],
  orgTeamIds: [] as string[],
};

async function loginAs(jar: CookieJar, email: string) {
  const response = await login(jar, email, DEFAULT_PASSWORD);
  expect(response.status).toBe(200);
}

describe("API e2e", () => {
  beforeAll(async () => {
    await loginAs(adminJar, SUPER_ADMIN_EMAIL);
    await loginAs(juniorJar, JUNIOR_EMAIL);
    await loginAs(listenerJar, SUPER_ADMIN_EMAIL);

    const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
    const workspace = (await workspaceResponse.json()) as WorkspaceData;

    if (workspace.teams.length > 0) {
      defaultTeam = workspace.teams[0];
      return;
    }

    const projectResponse = await apiFetch(adminJar, "/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "e2e-task-team" }),
    });
    expect(projectResponse.status).toBe(200);
    const project = (await projectResponse.json()) as { id: string; name: string };
    created.projectIds.push(project.id);
    defaultTeam = project.name;
  });

  afterAll(async () => {
    for (const scheduleId of created.scheduleIds) {
      await apiFetch(adminJar, `/api/schedule/${scheduleId}`, { method: "DELETE" });
    }
    for (const trashId of created.trashIds) {
      await apiFetch(adminJar, `/api/trash/${trashId}/restore`, { method: "POST" });
    }
    for (const taskId of created.taskIds) {
      await apiFetch(adminJar, `/api/tasks/${taskId}`, { method: "DELETE" });
    }
    for (const projectId of created.projectIds) {
      await apiFetch(adminJar, `/api/projects/${projectId}`, { method: "DELETE" });
    }
    for (const orgTeamId of created.orgTeamIds) {
      await apiFetch(adminJar, `/api/org-teams/${orgTeamId}`, { method: "DELETE" });
    }
    await apiFetch(adminJar, "/api/auth/logout", { method: "POST" });
    await apiFetch(juniorJar, "/api/auth/logout", { method: "POST" });
    await apiFetch(listenerJar, "/api/auth/logout", { method: "POST" });
  });

  describe("auth", () => {
    it("POST /api/auth/login returns 401 for bad password", async () => {
      const jar = new CookieJar();
      const response = await login(jar, SUPER_ADMIN_EMAIL, "wrong-password");
      expect(response.status).toBe(401);
    });

    it("GET /api/auth/me returns 200 with session", async () => {
      const response = await apiFetch(adminJar, "/api/auth/me");
      expect(response.status).toBe(200);
      const body = (await response.json()) as { staffMember?: { displayName?: string } };
      expect(body.staffMember?.displayName).toBeTruthy();
    });

    it("GET /api/auth/me returns 401 without cookies", async () => {
      const response = await apiFetch(new CookieJar(), "/api/auth/me");
      expect(response.status).toBe(401);
    });

    it("POST /api/auth/logout clears session", async () => {
      const jar = new CookieJar();
      await loginAs(jar, SUPER_ADMIN_EMAIL);
      const logout = await apiFetch(jar, "/api/auth/logout", { method: "POST" });
      expect(logout.status).toBe(200);
      const me = await apiFetch(jar, "/api/auth/me");
      expect(me.status).toBe(401);
      await loginAs(jar, SUPER_ADMIN_EMAIL);
    });
  });

  describe("health and workspace", () => {
    it("GET /api/health returns 200", async () => {
      const response = await apiFetch(new CookieJar(), "/api/health");
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; checks: Record<string, string> };
      expect(body.ok).toBe(true);
      expect(body.checks.database).toBe("ok");
      expect(body.checks.jwt).toBe("ok");
    });

    it("GET /api/workspace returns document and revision headers", async () => {
      const response = await apiFetch(adminJar, "/api/workspace");
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Workspace-Revision")).toBeTruthy();
      expect(response.headers.get("etag")).toBeTruthy();
      const body = (await response.json()) as WorkspaceData;
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(Array.isArray(body.staff)).toBe(true);
    });

    it("PUT /api/workspace succeeds as Super Admin", async () => {
      const getResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await getResponse.json()) as WorkspaceData;
      const response = await apiFetch(adminJar, "/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; revision: number };
      expect(body.ok).toBe(true);
      expect(body.revision).toBeGreaterThanOrEqual(0);
    });

    it("PUT /api/workspace strips forbidden junior merge", async () => {
      const getResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await getResponse.json()) as WorkspaceData;
      const incoming = structuredClone(workspace);
      const juniorName = E2E_JUNIOR_NAME;
      if (!incoming.staffProfiles[juniorName]) {
        throw new Error(`Missing e2e junior staff profile "${juniorName}".`);
      }
      incoming.staffProfiles[juniorName] = {
        ...incoming.staffProfiles[juniorName],
        permissionRole: "Super Admin",
      };

      const putResponse = await apiFetch(juniorJar, "/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incoming),
      });
      expect(putResponse.status).toBe(200);

      const verify = await apiFetch(adminJar, "/api/workspace");
      const saved = (await verify.json()) as WorkspaceData;
      expect(saved.staffProfiles[juniorName].permissionRole).not.toBe("Super Admin");
    });
  });

  describe("staff invite permissions", () => {
    it("POST /api/staff/invite returns 401 unauthenticated", async () => {
      const response = await apiFetch(new CookieJar(), "/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "E2E",
          lastName: "Guest",
          email: "e2e-guest@tracker.local",
        }),
      });
      expect(response.status).toBe(401);
    });

    it("POST /api/staff/invite returns 403 for junior", async () => {
      const response = await apiFetch(juniorJar, "/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "E2E",
          lastName: "Guest",
          email: "e2e-guest-junior@tracker.local",
        }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("tasks and trash", () => {
    it("creates, patches, moves, adds update, and reflects in workspace", async () => {
      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-task-flow",
          team: defaultTeam,
          status: "To Do",
        }),
      });
      expect(createResponse.status).toBe(200);
      const createdBody = (await createResponse.json()) as {
        task: { id: string; title: string; status: string };
        revision: number;
      };
      const taskId = createdBody.task.id;
      created.taskIds.push(taskId);

      const patchResponse = await apiFetch(adminJar, `/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "e2e-task-updated" }),
      });
      expect(patchResponse.status).toBe(200);

      const moveResponse = await apiFetch(adminJar, `/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "In Progress" }),
      });
      expect(moveResponse.status).toBe(200);

      const updateResponse = await apiFetch(adminJar, `/api/tasks/${taskId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "e2e update note" }),
      });
      expect(updateResponse.status).toBe(200);

      const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await workspaceResponse.json()) as WorkspaceData;
      const task = workspace.tasks.find((item) => item.id === taskId);
      expect(task?.title).toBe("e2e-task-updated");
      expect(task?.status).toBe("In Progress");
    });

    it("deletes to trash and restores", async () => {
      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-trash-task",
          team: defaultTeam,
        }),
      });
      const { task } = (await createResponse.json()) as { task: { id: string } };
      created.taskIds.push(task.id);

      const deleteResponse = await apiFetch(adminJar, `/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
      const deleteBody = (await deleteResponse.json()) as { trashId: string };
      created.trashIds.push(deleteBody.trashId);

      const restoreResponse = await apiFetch(adminJar, `/api/trash/${deleteBody.trashId}/restore`, {
        method: "POST",
      });
      expect(restoreResponse.status).toBe(200);
      created.trashIds.pop();
    });

    it("archives a task", async () => {
      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-archive-task",
          team: defaultTeam,
        }),
      });
      const { task } = (await createResponse.json()) as { task: { id: string } };
      created.taskIds.push(task.id);

      const archiveResponse = await apiFetch(adminJar, `/api/tasks/${task.id}/archive`, {
        method: "POST",
      });
      expect(archiveResponse.status).toBe(200);

      const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await workspaceResponse.json()) as WorkspaceData & {
        archivedTasks: Array<{ id: string }>;
      };
      expect(workspace.archivedTasks.some((item) => item.id === task.id)).toBe(true);
    });
  });

  describe("schedule", () => {
    it("creates, patches, and deletes schedule events", async () => {
      const createResponse = await apiFetch(adminJar, "/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-schedule-event",
          start: "2026-09-01T09:00:00.000Z",
          end: "2026-09-01T10:00:00.000Z",
          color: "#336699",
        }),
      });
      expect(createResponse.status).toBe(200);
      const { event } = (await createResponse.json()) as { event: { id: string; title: string } };
      created.scheduleIds.push(event.id);

      const patchResponse = await apiFetch(adminJar, `/api/schedule/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "e2e-schedule-updated" }),
      });
      expect(patchResponse.status).toBe(200);

      const deleteResponse = await apiFetch(adminJar, `/api/schedule/${event.id}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
      created.scheduleIds.pop();
    });

    it("persists schedule events across workspace reload", async () => {
      const createResponse = await apiFetch(adminJar, "/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-schedule-persist",
          start: "2026-09-02T09:00:00.000Z",
          end: "2026-09-02T10:00:00.000Z",
          color: "#336699",
        }),
      });
      expect(createResponse.status).toBe(200);
      const { event } = (await createResponse.json()) as { event: { id: string } };
      created.scheduleIds.push(event.id);

      const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
      expect(workspaceResponse.status).toBe(200);
      const workspace = (await workspaceResponse.json()) as WorkspaceData;
      expect(workspace.schedule.events.some((row) => row.id === event.id)).toBe(true);
    });

    it("returns assigned schedule events to guest workspace", async () => {
      const createResponse = await apiFetch(adminJar, "/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-schedule-guest",
          start: "2026-09-03T09:00:00.000Z",
          end: "2026-09-03T10:00:00.000Z",
          color: "#336699",
          guests: [E2E_JUNIOR_NAME],
        }),
      });
      expect(createResponse.status).toBe(200);
      const { event } = (await createResponse.json()) as {
        event: { id: string; guests: string[] };
      };
      created.scheduleIds.push(event.id);
      expect(event.guests).toContain(E2E_JUNIOR_NAME);

      const juniorWorkspaceResponse = await apiFetch(juniorJar, "/api/workspace");
      expect(juniorWorkspaceResponse.status).toBe(200);
      const juniorWorkspace = (await juniorWorkspaceResponse.json()) as WorkspaceData;
      const guestEvent = juniorWorkspace.schedule.events.find((row) => row.id === event.id);
      expect(guestEvent).toBeTruthy();
      expect(guestEvent?.guests).toContain(E2E_JUNIOR_NAME);
    });
  });

  describe("projects and org teams", () => {
    it("creates and deletes an e2e project", async () => {
      const createResponse = await apiFetch(adminJar, "/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "e2e-project" }),
      });
      expect(createResponse.status).toBe(200);
      const body = (await createResponse.json()) as { id: string };
      created.projectIds.push(body.id);

      const deleteResponse = await apiFetch(adminJar, `/api/projects/${body.id}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
      created.projectIds.pop();
    });

    it("creates and deletes an e2e org team", async () => {
      const createResponse = await apiFetch(adminJar, "/api/org-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "e2e-org-team" }),
      });
      expect(createResponse.status).toBe(200);
      const body = (await createResponse.json()) as { id: string };
      created.orgTeamIds.push(body.id);

      const deleteResponse = await apiFetch(adminJar, `/api/org-teams/${body.id}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
      created.orgTeamIds.pop();
    });
  });

  describe("notifications", () => {
    async function getJuniorStaffId() {
      const response = await apiFetch(juniorJar, "/api/auth/me");
      const body = (await response.json()) as { staffMember: { id: string } };
      return body.staffMember.id;
    }

    async function getAdminDisplayName() {
      const response = await apiFetch(adminJar, "/api/auth/me");
      const body = (await response.json()) as { staffMember: { displayName: string } };
      return body.staffMember.displayName;
    }

    it("notifies junior when assigned as task owner", async () => {
      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-notify-task",
          team: defaultTeam,
          status: "To Do",
        }),
      });
      expect(createResponse.status).toBe(200);
      const { task } = (await createResponse.json()) as { task: { id: string } };
      created.taskIds.push(task.id);

      const patchResponse = await apiFetch(adminJar, `/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owners: [E2E_JUNIOR_NAME] }),
      });
      expect(patchResponse.status).toBe(200);

      const notificationsResponse = await apiFetch(juniorJar, "/api/notifications");
      expect(notificationsResponse.status).toBe(200);
      const body = (await notificationsResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string; readAt: string | null }>;
        unreadCount: number;
      };
      const match = body.notifications.find(
        (row) => row.type === "TASK_ASSIGNED" && row.resourceId === task.id,
      );
      expect(match).toBeTruthy();
      expect(match?.readAt).toBeNull();
      expect(body.unreadCount).toBeGreaterThan(0);
    });

    it("notifies junior when added to a project", async () => {
      const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await workspaceResponse.json()) as WorkspaceData & {
        projectIds?: Record<string, string>;
      };
      const projectId = workspace.projectIds?.[defaultTeam];
      if (!projectId) throw new Error(`Missing project id for ${defaultTeam}`);

      const juniorStaffId = await getJuniorStaffId();

      const assignResponse = await apiFetch(adminJar, `/api/projects/${projectId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [juniorStaffId] }),
      });
      expect(assignResponse.status).toBe(200);

      const notificationsResponse = await apiFetch(juniorJar, "/api/notifications");
      const body = (await notificationsResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string }>;
      };
      expect(
        body.notifications.some(
          (row) => row.type === "PROJECT_ASSIGNED" && row.resourceId === projectId,
        ),
      ).toBe(true);
    });

    it("notifies junior when invited to a schedule event", async () => {
      const createResponse = await apiFetch(adminJar, "/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-notify-schedule",
          start: "2026-09-04T09:00:00.000Z",
          end: "2026-09-04T10:00:00.000Z",
          color: "#336699",
          guests: [E2E_JUNIOR_NAME],
        }),
      });
      expect(createResponse.status).toBe(200);
      const { event } = (await createResponse.json()) as { event: { id: string } };
      created.scheduleIds.push(event.id);

      const notificationsResponse = await apiFetch(juniorJar, "/api/notifications");
      const body = (await notificationsResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string; id: string }>;
      };
      expect(
        body.notifications.some(
          (row) => row.type === "SCHEDULE_INVITED" && row.resourceId === event.id,
        ),
      ).toBe(true);
    });

    it("marks notifications read", async () => {
      const notificationsResponse = await apiFetch(juniorJar, "/api/notifications");
      const body = (await notificationsResponse.json()) as {
        notifications: Array<{ id: string; readAt: string | null }>;
        unreadCount: number;
      };
      const unread = body.notifications.find((row) => row.readAt === null);
      if (!unread) return;

      const readResponse = await apiFetch(juniorJar, `/api/notifications/${unread.id}/read`, {
        method: "PATCH",
      });
      expect(readResponse.status).toBe(200);

      const verifyResponse = await apiFetch(juniorJar, "/api/notifications");
      const verify = (await verifyResponse.json()) as {
        notifications: Array<{ id: string; readAt: string | null }>;
        unreadCount: number;
      };
      const updated = verify.notifications.find((row) => row.id === unread.id);
      expect(updated?.readAt).toBeTruthy();
      expect(verify.unreadCount).toBeLessThan(body.unreadCount);
    });

    it("does not notify the actor for self-assignment", async () => {
      const adminName = await getAdminDisplayName();
      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-notify-self-task",
          team: defaultTeam,
          status: "To Do",
          owners: [adminName],
        }),
      });
      expect(createResponse.status).toBe(200);
      const { task } = (await createResponse.json()) as { task: { id: string } };
      created.taskIds.push(task.id);

      const notificationsResponse = await apiFetch(adminJar, "/api/notifications");
      const body = (await notificationsResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string }>;
      };
      expect(
        body.notifications.some(
          (row) => row.type === "TASK_ASSIGNED" && row.resourceId === task.id,
        ),
      ).toBe(false);
    });

    it("does not create duplicate notifications when membership is unchanged", async () => {
      const workspaceResponse = await apiFetch(adminJar, "/api/workspace");
      const workspace = (await workspaceResponse.json()) as WorkspaceData & {
        projectIds?: Record<string, string>;
      };
      const projectId = workspace.projectIds?.[defaultTeam];
      if (!projectId) throw new Error(`Missing project id for ${defaultTeam}`);
      const juniorStaffId = await getJuniorStaffId();

      const beforeResponse = await apiFetch(juniorJar, "/api/notifications");
      const before = (await beforeResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string }>;
      };
      const beforeCount = before.notifications.filter(
        (row) => row.type === "PROJECT_ASSIGNED" && row.resourceId === projectId,
      ).length;

      const assignResponse = await apiFetch(adminJar, `/api/projects/${projectId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [juniorStaffId] }),
      });
      expect(assignResponse.status).toBe(200);

      const afterResponse = await apiFetch(juniorJar, "/api/notifications");
      const after = (await afterResponse.json()) as {
        notifications: Array<{ type: string; resourceId: string }>;
      };
      const afterCount = after.notifications.filter(
        (row) => row.type === "PROJECT_ASSIGNED" && row.resourceId === projectId,
      ).length;

      expect(afterCount).toBe(beforeCount);
    });
  });

  describe("staff role permissions", () => {
    it("PATCH /api/staff/:id/role returns 403 for junior", async () => {
      const meResponse = await apiFetch(adminJar, "/api/auth/me");
      const me = (await meResponse.json()) as { staffMember: { id: string } };

      const response = await apiFetch(juniorJar, `/api/staff/${me.staffMember.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionRole: "Admin" }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("realtime SSE", () => {
    it("GET /api/events returns 401 without cookies", async () => {
      const response = await apiFetch(new CookieJar(), "/api/events");
      expect(response.status).toBe(401);
    });

    it("receives task.moved after move from another session", async () => {
      const workspaceBefore = await apiFetch(adminJar, "/api/workspace");
      const revision = Number.parseInt(
        workspaceBefore.headers.get("X-Workspace-Revision") ?? "0",
        10,
      );

      const createResponse = await apiFetch(adminJar, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "e2e-sse-task",
          team: defaultTeam,
          status: "To Do",
        }),
      });
      const { task } = (await createResponse.json()) as { task: { id: string } };
      created.taskIds.push(task.id);

      const ssePromise = readSseEvent(listenerJar, {
        afterRevision: revision,
        match: ({ type, payload }) =>
          type === "task.moved" && payload.resourceId === task.id,
        timeoutMs: 8000,
      });

      await sleep(300);

      const moveResponse = await apiFetch(adminJar, `/api/tasks/${task.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      expect(moveResponse.status).toBe(200);

      const event = await ssePromise;
      expect(event.type).toBe("task.moved");
    });
  });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
