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
  canSeeAllProjects?: boolean;
  clientId?: string;
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

const VISIBILITY_SENSITIVE_EVENTS = new Set([
  "task.created",
  "task.updated",
  "task.moved",
  "task.deleted",
  "task.archived",
  "task.restored",
  "task.update.added",
  "schedule.created",
  "schedule.updated",
  "schedule.deleted",
  "project.created",
  "project.updated",
  "project.deleted",
]);

export function createTrackerSync(ctx: TrackerSyncContext) {
  const canSeeAllProjects = ctx.canSeeAllProjects ?? true;
  const clientId = ctx.clientId ?? crypto.randomUUID();
  let workspaceRevision = 0;
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  let taskSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let scheduleSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let trashSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let notificationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  let knownTaskIds = new Set<string>();
  let knownScheduleIds = new Set<string>();
  /** Task ids the user explicitly edited — the only ones we PATCH. */
  let dirtyTaskIds = new Set<string>();
  let suppressRemoteUntil = 0;
  let taskSyncInFlight = false;
  let taskSyncQueued = false;
  /** Blocks debounced sync until init()/snapshotKnownIds() has run. */
  let syncReady = false;
  let workspaceReloadTimer: ReturnType<typeof setTimeout> | null = null;
  let workspaceReloadInFlight: Promise<void> | null = null;

  const TASK_SYNC_MS = 350;
  const SCHEDULE_SYNC_MS = 350;
  const WORKSPACE_RELOAD_MS = 400;

  function snapshotKnownIds() {
    const tasks = ctx.getTasks() as TaskLike[];
    knownTaskIds = new Set(tasks.map((task) => task.id));
    knownScheduleIds = new Set(
      ctx.getSchedule().events.map((event) => (event as ScheduleEventLike).id),
    );
    // Drop dirty flags for tasks that no longer exist locally.
    dirtyTaskIds = new Set([...dirtyTaskIds].filter((id) => knownTaskIds.has(id)));
  }

  function markTasksDirty(taskIds: string | string[] | null | undefined) {
    const ids = Array.isArray(taskIds) ? taskIds : taskIds ? [taskIds] : [];
    for (const id of ids) {
      if (id) dirtyTaskIds.add(id);
    }
  }

  function isSelfEvent(actorClientId: string | null | undefined) {
    return Boolean(actorClientId && actorClientId === clientId);
  }

  /** Keep SSE quiet while a mutation is in flight (moves can take seconds). */
  function beginRemoteSuppress(ms = 12_000) {
    suppressRemoteUntil = Math.max(suppressRemoteUntil, Date.now() + ms);
  }

  function endRemoteSuppress(ms = 2000) {
    suppressRemoteUntil = Date.now() + ms;
  }

  function taskIdFromEventPayload(
    type: string,
    data: Record<string, unknown> | undefined,
    resourceId: string | null | undefined,
  ): string | null {
    if (type === "task.moved" || type === "task.deleted" || type === "task.archived") {
      const nested = data?.task;
      if (nested && typeof nested === "object" && "id" in nested && typeof (nested as { id: unknown }).id === "string") {
        return (nested as { id: string }).id;
      }
    }
    if (data && typeof data.id === "string") return data.id;
    if (typeof resourceId === "string" && resourceId) return resourceId;
    return null;
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
    if (!syncReady) {
      taskSyncQueued = true;
      return;
    }
    if (taskSyncInFlight) {
      taskSyncQueued = true;
      return;
    }
    taskSyncInFlight = true;
    taskSyncQueued = false;
    suppressRemoteUntil = Date.now() + 1500;
    const tasks = ctx.getTasks() as TaskLike[];
    const currentIds = new Set(tasks.map((task) => task.id));
    let hadHardFailure = false;
    let savedSomething = false;

    try {
      for (const task of tasks) {
        if (!knownTaskIds.has(task.id)) {
          const createResponse = await apiFetch("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
              ...taskPayload(task),
              status: task.status ?? "To Do",
            }),
          });
          if (createResponse.ok) {
            const body = (await createResponse.json()) as { task?: TaskLike };
            if (body.task) {
              const serverId = body.task.id;
              const index = tasks.findIndex((row) => row.id === task.id);
              if (index >= 0) {
                tasks[index] = { ...tasks[index], ...body.task, id: serverId };
              }
              for (let i = tasks.length - 1; i >= 0; i -= 1) {
                if (i === index) continue;
                const row = tasks[i];
                if (row.id === serverId) {
                  tasks.splice(i, 1);
                  continue;
                }
                if (
                  !knownTaskIds.has(row.id) &&
                  (row.title || "") === (body.task.title || task.title || "") &&
                  (row.team || "") === (body.task.team || task.team || "") &&
                  (row.status || "To Do") === (body.task.status || task.status || "To Do")
                ) {
                  tasks.splice(i, 1);
                }
              }
              dirtyTaskIds.delete(task.id);
              dirtyTaskIds.delete(serverId);
              knownTaskIds.add(serverId);
              savedSomething = true;
            }
            continue;
          }

          if (createResponse.status === 403 || createResponse.status === 409) {
            // Already on the server (or create forbidden). Do not PATCH here —
            // bulk/fallback updates were the source of the 403 console noise.
            knownTaskIds.add(task.id);
            dirtyTaskIds.delete(task.id);
            continue;
          }

          hadHardFailure = true;
          console.warn(`Create task failed (${createResponse.status})`, task.id);
          continue;
        }

        if (!dirtyTaskIds.has(task.id)) continue;

        const response = await apiFetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify(taskPayload(task)),
        });
        if (response.ok) {
          const body = (await response.json().catch(() => ({}))) as { task?: TaskLike };
          if (body.task) {
            const index = tasks.findIndex((row) => row.id === task.id);
            if (index >= 0) {
              tasks[index] = { ...tasks[index], ...body.task };
            }
            knownTaskIds.add(body.task.id);
          }
          dirtyTaskIds.delete(task.id);
          savedSomething = true;
          continue;
        }

        if (response.status === 404) {
          dirtyTaskIds.delete(task.id);
          knownTaskIds.delete(task.id);
          continue;
        }

        if (response.status === 403) {
          dirtyTaskIds.delete(task.id);
          continue;
        }

        hadHardFailure = true;
        console.warn(`Update task failed (${response.status})`, task.id);
      }

      for (const id of knownTaskIds) {
        if (!currentIds.has(id)) {
          const deleted = (ctx.getDeletedTasks() as Array<{ id?: string; trashId?: string }>).find(
            (row) => row.id === id,
          );
          if (deleted) {
            dirtyTaskIds.delete(id);
            continue;
          }

          const archived = (ctx.getArchivedTasks() as Array<{ id?: string }>).some(
            (row) => row.id === id,
          );
          if (archived) {
            const archiveResponse = await apiFetch(`/api/tasks/${id}/archive`, {
              method: "POST",
              body: "{}",
            });
            if (archiveResponse.ok || archiveResponse.status === 404 || archiveResponse.status === 403) {
              dirtyTaskIds.delete(id);
              if (archiveResponse.ok) savedSomething = true;
            } else {
              hadHardFailure = true;
              console.warn(`Archive task failed (${archiveResponse.status})`, id);
            }
          }
        }
      }

      ctx.setTasks([...tasks]);
      if (hadHardFailure) {
        setBackupStatus("Some task changes could not be saved. Retry or export a backup.", true);
      } else if (savedSomething) {
        setBackupStatus("Saved to database.");
      }
    } catch (error) {
      console.error("Task sync failed.", error);
      setBackupStatus("Could not save task changes. Retry or export a backup.", true);
    } finally {
      taskSyncInFlight = false;
      if (taskSyncQueued) {
        taskSyncQueued = false;
        void syncTasksNow();
      }
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
    beginRemoteSuppress();

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
    } finally {
      endRemoteSuppress();
    }
  }

  async function syncTaskArchive(taskId: string) {
    beginRemoteSuppress();
    dirtyTaskIds.delete(taskId);

    try {
      const response = await apiFetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
        body: "{}",
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Archive task failed (${response.status})`);
      }

      const body = (await response.json().catch(() => ({}))) as { archivedId?: string };
      const archived = ctx.getArchivedTasks() as Array<{ id: string; archivedId?: string }>;
      const row = archived.find((entry) => entry.id === taskId);
      if (row && body.archivedId) {
        row.archivedId = body.archivedId;
        ctx.setArchivedTasks([...archived]);
      }

      knownTaskIds.delete(taskId);
      snapshotKnownIds();
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Archive sync failed.", error);
      setBackupStatus("Could not archive task. Retry or export a backup.", true);
    } finally {
      endRemoteSuppress();
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
    beginRemoteSuppress();
    // Status changes are handled by /move — never treat the card as a detail edit.
    dirtyTaskIds.delete(taskId);
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
        knownTaskIds.add(body.task.id);
      } else {
        knownTaskIds.add(taskId);
      }
      setBackupStatus("Saved to database.");
    } catch (error) {
      console.error("Move sync failed.", error);
      setBackupStatus("Could not save task move.", true);
    } finally {
      endRemoteSuppress();
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
    if (index >= 0) {
      // Do not clobber an in-flight local edit.
      if (dirtyTaskIds.has(task.id)) {
        knownTaskIds.add(task.id);
        return;
      }
      tasks[index] = { ...tasks[index], ...task };
      ctx.setTasks([...tasks]);
      knownTaskIds.add(task.id);
      return;
    }

    // Replace optimistic local copies (temp client UUID) of the same create
    // so SSE / POST races do not leave duplicate cards on the board.
    const next = tasks.filter((row) => {
      if (row.id === task.id) return false;
      if (knownTaskIds.has(row.id)) return true;
      const sameCreate =
        (row.title || "") === (task.title || "") &&
        (row.team || "") === (task.team || "") &&
        (row.status || "To Do") === (task.status || "To Do");
      return !sameCreate;
    });
    next.push(task);
    knownTaskIds.add(task.id);
    dirtyTaskIds.delete(task.id);
    ctx.setTasks(next);
  }

  function removeTaskFromBoard(taskId: string) {
    dirtyTaskIds.delete(taskId);
    knownTaskIds.delete(taskId);
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

  async function reloadWorkspaceNow() {
    if (workspaceReloadInFlight) return workspaceReloadInFlight;

    workspaceReloadInFlight = (async () => {
      console.log("[project-config]", {
        layer: "tracker-sync",
        step: "reloadWorkspace-start",
      });
      try {
        const response = await fetch("/api/workspace", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          console.log("[project-config]", {
            layer: "tracker-sync",
            step: "reloadWorkspace-abort",
            status: response.status,
          });
          return;
        }
        const revisionHeader = response.headers.get("X-Workspace-Revision");
        if (revisionHeader) {
          const parsed = Number.parseInt(revisionHeader, 10);
          if (Number.isFinite(parsed)) workspaceRevision = parsed;
        }
        const data = await response.json();
        console.log("[project-config]", {
          layer: "tracker-sync",
          step: "reloadWorkspace-apply",
          revision: workspaceRevision,
        });
        ctx.applyWorkspaceData(data);
        snapshotKnownIds();
        ctx.render();
        ctx.renderTrash();
        ctx.renderScheduleView({ preserveScroll: true });
        console.log("[project-config]", {
          layer: "tracker-sync",
          step: "reloadWorkspace-done",
        });
      } catch (error) {
        console.error("[project-config] reloadWorkspace failed", error);
      } finally {
        workspaceReloadInFlight = null;
      }
    })();

    return workspaceReloadInFlight;
  }

  function reloadWorkspace() {
    // Coalesce bursts of SSE visibility events into one expensive workspace fetch.
    if (workspaceReloadTimer) clearTimeout(workspaceReloadTimer);
    workspaceReloadTimer = setTimeout(() => {
      workspaceReloadTimer = null;
      void reloadWorkspaceNow();
    }, WORKSPACE_RELOAD_MS);
  }

  function scheduleNotificationRefresh() {
    if (!ctx.refreshNotifications) return;
    if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
    notificationRefreshTimer = setTimeout(() => {
      void ctx.refreshNotifications?.();
    }, 400);
  }

  const seenRemoteKeys = new Set<string>();

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

    const dedupeKey = `${payload.revision ?? "?"}:${payload.type ?? event.type}:${payload.resourceId ?? ""}`;
    if (seenRemoteKeys.has(dedupeKey)) return;
    seenRemoteKeys.add(dedupeKey);
    if (seenRemoteKeys.size > 500) {
      const oldest = seenRemoteKeys.values().next().value;
      if (oldest !== undefined) seenRemoteKeys.delete(oldest);
    }

    if (typeof payload.revision === "number" && payload.revision > workspaceRevision) {
      workspaceRevision = payload.revision;
    }

    const type = payload.type ?? event.type;
    const data = payload.payload as Record<string, unknown> | undefined;

    if (
      type === "project.created" ||
      type === "project.updated" ||
      type === "project.deleted"
    ) {
      const selfEvent = isSelfEvent(payload.actorClientId);
      console.log("[project-config]", {
        layer: "tracker-sync",
        step: "sse-project-event",
        type,
        actorClientId: payload.actorClientId,
        trackerClientId: clientId,
        treatedAsSelf: selfEvent,
        resourceId: payload.resourceId,
      });
    }

    if (type === "notification.created") {
      if (data && typeof data === "object" && "recipientId" in data) {
        ctx.onNotificationCreated?.(data);
      }
      return;
    }

    if (isSelfEvent(payload.actorClientId)) return;

    if (!canSeeAllProjects && VISIBILITY_SENSITIVE_EVENTS.has(type)) {
      // Moves/updates of tasks already on this client's board do not change
      // project visibility — apply incrementally instead of a full reload.
      const eventTaskId = taskIdFromEventPayload(type, data, payload.resourceId);
      // task.updated may change owners — always reload so reassignment drops/adds correctly.
      const canApplyKnownTask =
        (type === "task.moved" || type === "task.update.added") &&
        Boolean(eventTaskId && knownTaskIds.has(eventTaskId));

      if (!canApplyKnownTask) {
        console.log("[project-config]", {
          layer: "tracker-sync",
          step: "reloadWorkspace-trigger",
          reason: "visibility-sensitive-event",
          type,
        });
        void reloadWorkspace();
        scheduleNotificationRefresh();
        return;
      }
    }

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
        console.log("[project-config]", {
          layer: "tracker-sync",
          step: "reloadWorkspace-trigger",
          reason: "project-event",
          type,
        });
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
    // Catch-all for any event types without a dedicated listener below.
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
    eventSource.addEventListener("orgTeam.created", handleRemoteEvent as EventListener);
    eventSource.addEventListener("orgTeam.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("orgTeam.deleted", handleRemoteEvent as EventListener);
    eventSource.addEventListener("staff.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("staff.role.updated", handleRemoteEvent as EventListener);
    eventSource.addEventListener("staff.deleted", handleRemoteEvent as EventListener);
    eventSource.addEventListener("permissions.updated", handleRemoteEvent as EventListener);

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectEvents, 3000);
    };
  }

  function scheduleTaskSync() {
    // Suppress remote echoes immediately, not only when the debounced sync starts.
    suppressRemoteUntil = Date.now() + 1500;
    if (!syncReady) {
      taskSyncQueued = true;
      return;
    }
    const tasks = ctx.getTasks() as TaskLike[];
    const hasCreates = tasks.some((task) => !knownTaskIds.has(task.id));
    // Skip no-op syncs (e.g. drag/drop used to call save() and trigger PATCH).
    if (!hasCreates && dirtyTaskIds.size === 0) return;

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
    console.log("[project-config]", {
      layer: "tracker-sync",
      step: "init",
      clientId,
      initialRevision,
    });
    snapshotKnownIds();
    syncReady = true;
    connectEvents();

    const pendingDeletes = (ctx.getDeletedTasks() as Array<{ trashId?: string }>).some(
      (row) => !row.trashId,
    );
    if (pendingDeletes) {
      void syncTrashNow();
    }

    if (taskSyncQueued) {
      taskSyncQueued = false;
      scheduleTaskSync();
    }
  }

  return {
    init,
    scheduleTaskSync,
    markTasksDirty,
    scheduleTrashSync,
    scheduleScheduleSync,
    syncScheduleEvent,
    syncScheduleDelete,
    syncTaskMove,
    syncTaskUpdate,
    syncTaskDelete,
    syncTaskArchive,
    syncTrashRestore,
    snapshotKnownIds,
  };
}
