/** Client-side incremental API sync + SSE for the tracker UI. */

export type TrackerSyncContext = {
  getTasks: () => unknown[];
  setTasks: (tasks: unknown[]) => void;
  getDeletedTasks: () => unknown[];
  setDeletedTasks: (tasks: unknown[]) => void;
  getArchivedTasks: () => unknown[];
  setArchivedTasks: (tasks: unknown[]) => void;
  getSchedule: () => { events: unknown[] };
  setSchedule: (schedule: { events: unknown[] }, options?: { persist?: boolean }) => void;

  applyWorkspaceData: (data: unknown) => void;
  render: () => void;
  renderTrash: () => void;
  renderScheduleView: (options?: { preserveScroll?: boolean }) => void;
  setBackupStatus: (message: string, isError?: boolean) => void;
  onNotificationCreated?: (notification: Record<string, unknown>) => void;
  refreshNotifications?: () => void | Promise<void>;
};

type TaskLike = {
  id: string;
  title?: string;
  team?: string;
  status?: string;
  description?: string;
  priority?: string;
  due?: string;
  owners?: string[];
  owner?: string;
  updates?: unknown[];
};

type ScheduleEventLike = {
  id: string;
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  project?: string;
  color?: string;
  guests?: string[];
};

export function createTrackerSync(ctx: TrackerSyncContext) {
  const clientId = crypto.randomUUID();
  let workspaceRevision = 0;
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  let taskSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let scheduleSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let trashSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let notificationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  let knownTaskIds = new Set<string>();
  let knownScheduleIds = new Set<string>();
  let suppressRemoteUntil = 0;

  const TASK_SYNC_MS = 350;
  const SCHEDULE_SYNC_MS = 350;

  function snapshotKnownIds() {
    knownTaskIds = new Set(ctx.getTasks().map((task) => (task as TaskLike).id));
    knownScheduleIds = new Set(
      ctx.getSchedule().events.map((event) => (event as ScheduleEventLike).id),
    );
  }

  function isSelfEvent(actorClientId: string | null | undefined) {
    return Boolean(actorClientId && actorClientId === clientId);
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

    const revisionHeader = response.headers.get("X-Workspace-Revision");
    if (revisionHeader) {
      const parsed = Number.parseInt(revisionHeader, 10);
      if (Number.isFinite(parsed)) {
        workspaceRevision = parsed;
      }
    }

    return response;
  }

  function taskPayload(task: TaskLike) {
    return {
      title: task.title,
      team: task.team,
      description: task.description,
      priority: task.priority,
      due: task.due,
      owners: Array.isArray(task.owners)
        ? task.owners
        : task.owner
          ? [task.owner]
          : [],
    };
  }

  async function syncTasksNow() {
    suppressRemoteUntil = Date.now() + 1500;
    const tasks = ctx.getTasks() as TaskLike[];
    const currentIds = new Set(tasks.map((task) => task.id));

    try {
      for (const task of tasks) {
        if (!knownTaskIds.has(task.id)) {
          const response = await apiFetch("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
              ...taskPayload(task),
              status: task.status ?? "To Do",
            }),
          });
          if (!response.ok) {
            throw new Error(`Create task failed (${response.status})`);
          }
          const body = (await response.json()) as { task?: TaskLike };
          if (body.task) {
            const index = tasks.findIndex((row) => row.id === task.id);
            if (index >= 0) {
              tasks[index] = { ...tasks[index], ...body.task, id: body.task.id };
            }
          }
          continue;
        }

        const response = await apiFetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify(taskPayload(task)),
        });
        if (!response.ok && response.status !== 404) {
          throw new Error(`Update task failed (${response.status})`);
        }
      }

      for (const id of knownTaskIds) {
        if (!currentIds.has(id)) {
          const deleted = (ctx.getDeletedTasks() as Array<{ id?: string; trashId?: string }>).find(
            (row) => row.id === id,
          );
          if (deleted) continue;

          const archived = (ctx.getArchivedTasks() as Array<{ id?: string }>).some(
            (row) => row.id === id,
          );
          if (archived) {
            await apiFetch(`/api/tasks/${id}/archive`, { method: "POST", body: "{}" });
          }
        }
      }

      ctx.setTasks([...tasks]);
      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Task sync failed.", error);
      setBackupStatus("Could not save task changes. Retry or export a backup.", true);
    }
  }

  async function syncTrashNow() {
    suppressRemoteUntil = Date.now() + 1500;
    const deletedTasks = ctx.getDeletedTasks() as Array<{
      id: string;
      trashId?: string;
    }>;

    try {
      for (const trashed of deletedTasks) {
        if (!trashed.id || trashed.trashId) continue;

        const response = await apiFetch(`/api/tasks/${trashed.id}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
          throw new Error(`Delete task failed (${response.status})`);
        }
        const body = (await response.json()) as { trashId?: string };
        if (body.trashId) {
          trashed.trashId = body.trashId;
        }
      }

      ctx.setDeletedTasks([...deletedTasks]);
      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Trash sync failed.", error);
      setBackupStatus("Could not save trash changes.", true);
    }
  }

  async function syncTaskDelete(taskId: string) {
    suppressRemoteUntil = Date.now() + 1500;

    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete task failed (${response.status})`);
      }

      const body = (await response.json()) as { trashId?: string };
      const deletedTasks = ctx.getDeletedTasks() as Array<{ id: string; trashId?: string }>;
      const trashed = deletedTasks.find((row) => row.id === taskId);
      if (trashed && body.trashId) {
        trashed.trashId = body.trashId;
        ctx.setDeletedTasks([...deletedTasks]);
      }

      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Delete sync failed.", error);
      setBackupStatus("Could not save task deletion. Retry or export a backup.", true);
    }
  }

  function scheduleEventPayload(event: ScheduleEventLike) {
    return {
      title: event.title ?? "",
      start: event.start,
      end: event.end,
      allDay: Boolean(event.allDay),
      description: event.description ?? "",
      location: event.location ?? "",
      project: event.project ?? "",
      color: event.color ?? "#336699",
      guests: event.guests ?? [],
    };
  }

  function mergeScheduleEventFromServer(serverEvent: ScheduleEventLike) {
    applyScheduleEvent(serverEvent);
  }

  async function upsertScheduleEvent(event: ScheduleEventLike) {
    const payload = scheduleEventPayload(event);

    if (!knownScheduleIds.has(event.id)) {
      const response = await apiFetch("/api/schedule", {
        method: "POST",
        body: JSON.stringify({ ...payload, id: event.id }),
      });
      if (response.ok) {
        const body = (await response.json()) as { event?: ScheduleEventLike };
        if (body.event) mergeScheduleEventFromServer(body.event);
        return;
      }

      const patchResponse = await apiFetch(`/api/schedule/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!patchResponse.ok && patchResponse.status !== 404) {
        throw new Error(`Create schedule event failed (${response.status})`);
      }
      if (patchResponse.ok) {
        const body = (await patchResponse.json()) as { event?: ScheduleEventLike };
        if (body.event) mergeScheduleEventFromServer(body.event);
      }
      return;
    }

    const response = await apiFetch(`/api/schedule/${event.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Update schedule event failed (${response.status})`);
    }
    if (response.ok) {
      const body = (await response.json()) as { event?: ScheduleEventLike };
      if (body.event) mergeScheduleEventFromServer(body.event);
    }
  }

  async function syncScheduleNow() {
    suppressRemoteUntil = Date.now() + 1500;
    const schedule = ctx.getSchedule();
    const events = schedule.events as ScheduleEventLike[];
    const currentIds = new Set(events.map((event) => event.id));

    try {
      for (const event of events) {
        await upsertScheduleEvent(event);
      }

      for (const id of knownScheduleIds) {
        if (!currentIds.has(id)) {
          const response = await apiFetch(`/api/schedule/${id}`, { method: "DELETE" });
          if (!response.ok && response.status !== 404) {
            throw new Error(`Delete schedule event failed (${response.status})`);
          }
        }
      }

      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Schedule sync failed.", error);
      setBackupStatus("Could not save schedule changes.", true);
    }
  }

  async function syncScheduleEvent(eventId: string) {
    suppressRemoteUntil = Date.now() + 1500;
    const schedule = ctx.getSchedule();
    const event = (schedule.events as ScheduleEventLike[]).find((row) => row.id === eventId);
    if (!event) return;

    try {
      await upsertScheduleEvent(event);
      snapshotKnownIds();
      ctx.renderScheduleView({ preserveScroll: true });
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Schedule save sync failed.", error);
      setBackupStatus("Could not save schedule event. Retry or export a backup.", true);
    }
  }

  async function syncScheduleDelete(eventId: string) {
    suppressRemoteUntil = Date.now() + 1500;

    try {
      const response = await apiFetch(`/api/schedule/${eventId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete schedule event failed (${response.status})`);
      }
      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Schedule delete sync failed.", error);
      setBackupStatus("Could not save schedule deletion.", true);
    }
  }

  async function syncTaskMove(taskId: string, status: string) {
    suppressRemoteUntil = Date.now() + 1500;
    try {
      const response = await apiFetch(`/api/tasks/${taskId}/move`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`Move task failed (${response.status})`);
      }
      const body = (await response.json()) as { task?: TaskLike };
      if (body.task) {
        const tasks = ctx.getTasks() as TaskLike[];
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index >= 0) {
          tasks[index] = { ...tasks[index], ...body.task };
          ctx.setTasks([...tasks]);
        }
      }
      snapshotKnownIds();
    } catch (error) {
      console.error("Move sync failed.", error);
      setBackupStatus("Could not save task move.", true);
    }
  }

  async function syncTaskUpdate(taskId: string, text: string) {
    suppressRemoteUntil = Date.now() + 1500;
    try {
      const response = await apiFetch(`/api/tasks/${taskId}/updates`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        throw new Error(`Add update failed (${response.status})`);
      }
      const body = (await response.json()) as { task?: TaskLike };
      if (body.task) {
        applyTaskFromServer(body.task);
      }
    } catch (error) {
      console.error("Update note sync failed.", error);
      setBackupStatus("Could not save task update.", true);
    }
  }

  async function syncTrashRestore(trashId: string) {
    suppressRemoteUntil = Date.now() + 1500;
    try {
      const response = await apiFetch(`/api/trash/${trashId}/restore`, {
        method: "POST",
        body: "{}",
      });
      if (!response.ok) {
        throw new Error(`Restore failed (${response.status})`);
      }
      const body = (await response.json()) as { task?: TaskLike };
      if (body.task) {
        applyTaskFromServer(body.task);
      }
      snapshotKnownIds();
    } catch (error) {
      console.error("Restore sync failed.", error);
      setBackupStatus("Could not restore task.", true);
    }
  }

  function setBackupStatus(message: string, isError = false) {
    ctx.setBackupStatus(message, isError);
  }

  function applyTaskFromServer(task: TaskLike) {
    const tasks = ctx.getTasks() as TaskLike[];
    const index = tasks.findIndex((row) => row.id === task.id);
    if (index >= 0) tasks[index] = { ...tasks[index], ...task };
    else tasks.push(task);
    ctx.setTasks([...tasks]);
  }

  function removeTaskFromBoard(taskId: string) {
    ctx.setTasks((ctx.getTasks() as TaskLike[]).filter((task) => task.id !== taskId));
  }

  function applyScheduleEvent(event: ScheduleEventLike) {
    const schedule = ctx.getSchedule();
    const events = schedule.events as ScheduleEventLike[];
    const index = events.findIndex((row) => row.id === event.id);
    if (index >= 0) events[index] = { ...events[index], ...event };
    else events.push(event);
    ctx.setSchedule({ events: [...events] }, { persist: true });
  }

  function removeScheduleEvent(eventId: string) {
    const schedule = ctx.getSchedule();
    ctx.setSchedule(
      {
        events: (schedule.events as ScheduleEventLike[]).filter((event) => event.id !== eventId),
      },
      { persist: true },
    );
  }

  async function reloadWorkspace() {
    try {
      const response = await fetch("/api/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const revisionHeader = response.headers.get("X-Workspace-Revision");
      if (revisionHeader) {
        const parsed = Number.parseInt(revisionHeader, 10);
        if (Number.isFinite(parsed)) workspaceRevision = parsed;
      }
      const data = await response.json();
      ctx.applyWorkspaceData(data);
      snapshotKnownIds();
      ctx.render();
      ctx.renderTrash();
      ctx.renderScheduleView({ preserveScroll: true });
    } catch (error) {
      console.error("Workspace reload failed.", error);
    }
  }

  function scheduleNotificationRefresh() {
    if (!ctx.refreshNotifications) return;
    if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
    notificationRefreshTimer = setTimeout(() => {
      void ctx.refreshNotifications?.();
    }, 400);
  }

  function handleRemoteEvent(event: MessageEvent<string>) {
    if (Date.now() < suppressRemoteUntil) return;

    let payload: {
      type?: string;
      revision?: number;
      actorClientId?: string | null;
      payload?: unknown;
      resourceId?: string | null;
    };

    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (typeof payload.revision === "number" && payload.revision > workspaceRevision) {
      workspaceRevision = payload.revision;
    }

    const type = payload.type ?? event.type;
    const data = payload.payload as Record<string, unknown> | undefined;

    if (type === "notification.created") {
      if (data && typeof data === "object" && "recipientId" in data) {
        ctx.onNotificationCreated?.(data);
      }
      return;
    }

    if (isSelfEvent(payload.actorClientId)) return;

    switch (type) {
      case "task.created":
      case "task.updated":
      case "task.restored":
      case "task.update.added":
        if (data && typeof data === "object" && "id" in data) {
          applyTaskFromServer(data as TaskLike);
          ctx.render();
        }
        scheduleNotificationRefresh();
        break;
      case "task.moved":
        if (data?.task && typeof data.task === "object") {
          applyTaskFromServer(data.task as TaskLike);
          ctx.render();
        }
        scheduleNotificationRefresh();
        break;
      case "task.deleted":
        if (data?.task && typeof data.task === "object" && "id" in (data.task as object)) {
          const task = data.task as TaskLike;
          removeTaskFromBoard(task.id);
          const deleted = ctx.getDeletedTasks() as Array<Record<string, unknown> & { trashId?: string; id: string }>;
          const trashId = typeof data.trashId === "string" ? data.trashId : null;
          if (trashId && !deleted.some(row => row.trashId === trashId)) {
            deleted.push({
              ...task,
              trashId,
              deletedAt: new Date().toISOString(),
            });
            ctx.setDeletedTasks([...deleted]);
          }
          ctx.render();
          ctx.renderTrash();
        }
        break;
      case "task.archived":
        if (data?.task && typeof data.task === "object" && "id" in (data.task as object)) {
          const task = data.task as TaskLike;
          removeTaskFromBoard(task.id);
          const archived = ctx.getArchivedTasks() as Array<Record<string, unknown> & { archivedId?: string; id: string }>;
          const archivedId = typeof data.archivedId === "string" ? data.archivedId : null;
          if (archivedId && !archived.some(row => row.archivedId === archivedId)) {
            archived.push({
              ...task,
              archivedId,
              archivedAt: new Date().toISOString(),
            });
            ctx.setArchivedTasks([...archived]);
          }
          ctx.render();
        }
        break;
      case "schedule.created":
      case "schedule.updated":
        if (data && typeof data === "object" && "id" in data) {
          applyScheduleEvent(data as ScheduleEventLike);
          ctx.renderScheduleView({ preserveScroll: true });
        }
        scheduleNotificationRefresh();
        break;
      case "schedule.deleted":
        if (data?.id && typeof data.id === "string") {
          removeScheduleEvent(data.id);
          ctx.renderScheduleView({ preserveScroll: true });
        } else if (payload.resourceId) {
          removeScheduleEvent(payload.resourceId);
          ctx.renderScheduleView({ preserveScroll: true });
        }
        break;
      case "project.created":
      case "project.updated":
      case "project.deleted":
        void reloadWorkspace();
        scheduleNotificationRefresh();
        break;
      case "workspace.reload":
      case "permissions.updated":
      case "staff.updated":
      case "staff.role.updated":
      case "staff.deleted":
      case "orgTeam.created":
      case "orgTeam.updated":
      case "orgTeam.deleted":
        void reloadWorkspace();
        break;
      default:
        break;
    }
  }

  function connectEvents() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    const url =
      workspaceRevision > 0 ? `/api/events?after=${workspaceRevision}` : "/api/events";

    eventSource = new EventSource(url, { withCredentials: true });
    eventSource.onmessage = handleRemoteEvent;
    eventSource.addEventListener("task.created", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.moved", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.deleted", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.archived", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.restored", handleRemoteEvent as EventListener);
    eventSource.addEventListener("task.update.added", handleRemoteEvent as EventListener);
    eventSource.addEventListener("schedule.created", handleRemoteEvent as EventListener);
    eventSource.addEventListener("schedule.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("schedule.deleted", handleRemoteEvent as EventListener);
    eventSource.addEventListener("project.created", handleRemoteEvent as EventListener);
    eventSource.addEventListener("project.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("project.deleted", handleRemoteEvent as EventListener);
    eventSource.addEventListener("notification.created", handleRemoteEvent as EventListener);
    eventSource.addEventListener("workspace.reload", handleRemoteEvent as EventListener);

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectEvents, 3000);
    };
  }

  function scheduleTaskSync() {
    if (taskSyncTimer) clearTimeout(taskSyncTimer);
    taskSyncTimer = setTimeout(() => {
      void syncTasksNow();
    }, TASK_SYNC_MS);
  }

  function scheduleTrashSync() {
    if (trashSyncTimer) clearTimeout(trashSyncTimer);
    trashSyncTimer = setTimeout(() => {
      void syncTrashNow();
    }, TASK_SYNC_MS);
  }

  function scheduleScheduleSync() {
    if (scheduleSyncTimer) clearTimeout(scheduleSyncTimer);
    scheduleSyncTimer = setTimeout(() => {
      void syncScheduleNow();
    }, SCHEDULE_SYNC_MS);
  }

  function init(initialRevision = 0) {
    workspaceRevision = initialRevision;
    snapshotKnownIds();
    connectEvents();

    const pendingDeletes = (ctx.getDeletedTasks() as Array<{ trashId?: string }>).some(
      (row) => !row.trashId,
    );
    if (pendingDeletes) {
      void syncTrashNow();
    }
  }

  return {
    init,
    scheduleTaskSync,
    scheduleTrashSync,
    scheduleScheduleSync,
    syncScheduleEvent,
    syncScheduleDelete,
    syncTaskMove,
    syncTaskUpdate,
    syncTaskDelete,
    syncTrashRestore,
    snapshotKnownIds,
  };
}
