/** Header notification bell + dropdown. */

export type NotificationItem = {
  id: string;
  recipientId: string;
  type: "TASK_ASSIGNED" | "PROJECT_ASSIGNED" | "SCHEDULE_INVITED";
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationCenterContext = {
  recipientStaffId: string;
  navigate: (notification: NotificationItem) => void;
};

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createNotificationCenter(ctx: NotificationCenterContext) {
  const btn = document.getElementById("notificationBtn");
  const dropdown = document.getElementById("notificationDropdown");
  const countEl = document.getElementById("notificationCount");
  const listEl = document.getElementById("notificationList");
  const markAllBtn = document.getElementById("notificationMarkAllBtn");

  const noop = {
    init: async () => {},
    refresh: async () => {},
    handleRemoteNotification: (_notification: NotificationItem) => {},
    consumeDeepLink: (_type: string | null, _id: string | null) => {},
  };

  if (!btn || !dropdown || !countEl || !listEl || !markAllBtn) {
    return noop;
  }

  const notificationBtn = btn;
  const notificationDropdown = dropdown;
  const notificationCountEl = countEl;
  const notificationListEl = listEl;
  const notificationMarkAllBtn = markAllBtn;

  let notifications: NotificationItem[] = [];
  let unreadCount = 0;
  let open = false;

  function formatRelativeTime(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function updateBadge() {
    if (unreadCount > 0) {
      notificationCountEl.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      notificationCountEl.hidden = false;
      notificationBtn.classList.add("has-unread");
    } else {
      notificationCountEl.hidden = true;
      notificationBtn.classList.remove("has-unread");
    }
  }

  function renderList() {
    notificationListEl.innerHTML = "";

    if (!notifications.length) {
      const empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = "No notifications yet.";
      notificationListEl.appendChild(empty);
      return;
    }

    notifications.forEach((notification) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "notification-item" + (notification.readAt ? "" : " unread");
      button.dataset.id = notification.id;
      button.innerHTML = `
        <span class="notification-item-title">${escapeHtml(notification.title)}</span>
        <span class="notification-item-body">${escapeHtml(notification.body)}</span>
        <span class="notification-item-time">${escapeHtml(formatRelativeTime(notification.createdAt))}</span>
      `;
      button.addEventListener("click", () => {
        void handleItemClick(notification);
      });
      notificationListEl.appendChild(button);
    });
  }

  function setOpen(nextOpen: boolean) {
    open = nextOpen;
    notificationDropdown.hidden = !open;
    notificationBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  async function apiFetch(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  async function markRead(notificationId: string) {
    const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { notification?: NotificationItem };
    return body.notification ?? null;
  }

  async function handleItemClick(notification: NotificationItem) {
    let nextNotification = notification;
    if (!notification.readAt) {
      const updated = await markRead(notification.id);
      if (updated) {
        notifications = notifications.map((row) =>
          row.id === updated.id ? updated : row,
        );
        unreadCount = Math.max(0, unreadCount - 1);
        updateBadge();
        renderList();
        nextNotification = updated;
      }
    }

    setOpen(false);
    ctx.navigate(nextNotification);
  }

  async function loadNotifications() {
    const response = await apiFetch("/api/notifications");
    if (!response.ok) return;

    const body = (await response.json()) as {
      notifications?: NotificationItem[];
      unreadCount?: number;
    };

    notifications = Array.isArray(body.notifications) ? body.notifications : [];
    unreadCount = typeof body.unreadCount === "number" ? body.unreadCount : 0;
    updateBadge();
    renderList();
  }

  function prependNotification(notification: NotificationItem) {
    const existingIndex = notifications.findIndex((row) => row.id === notification.id);
    if (existingIndex >= 0) {
      const existing = notifications[existingIndex];
      if (!existing.readAt && notification.readAt) {
        unreadCount = Math.max(0, unreadCount - 1);
      } else if (existing.readAt && !notification.readAt) {
        unreadCount += 1;
      }
      notifications.splice(existingIndex, 1);
    } else if (!notification.readAt) {
      unreadCount += 1;
    }

    notifications.unshift(notification);
    if (notifications.length > 50) {
      notifications = notifications.slice(0, 50);
    }
    updateBadge();
    renderList();
    notificationBtn.classList.add("notification-pulse");
    window.setTimeout(() => {
      notificationBtn.classList.remove("notification-pulse");
    }, 1200);
  }

  function normalizeNotification(value: Record<string, unknown>): NotificationItem | null {
    if (!value.id || !value.recipientId || !value.type) return null;
    return {
      id: String(value.id),
      recipientId: String(value.recipientId),
      type: value.type as NotificationItem["type"],
      title: String(value.title ?? "Notification"),
      body: String(value.body ?? ""),
      resourceType: String(value.resourceType ?? ""),
      resourceId: String(value.resourceId ?? ""),
      readAt: typeof value.readAt === "string" ? value.readAt : null,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    };
  }

  notificationBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  notificationMarkAllBtn.addEventListener("click", async () => {
    const response = await apiFetch("/api/notifications/read-all", { method: "PATCH" });
    if (!response.ok) return;
    notifications = notifications.map((row) => ({
      ...row,
      readAt: row.readAt ?? new Date().toISOString(),
    }));
    unreadCount = 0;
    updateBadge();
    renderList();
  });

  document.addEventListener("click", (event) => {
    if (!open) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (notificationDropdown.contains(target) || notificationBtn.contains(target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
    }
  });

  return {
    init: loadNotifications,
    refresh: loadNotifications,
    handleRemoteNotification(notification: NotificationItem | Record<string, unknown>) {
      const normalized =
        "recipientId" in notification && typeof notification.recipientId === "string" &&
        "type" in notification
          ? (notification as NotificationItem)
          : normalizeNotification(notification as Record<string, unknown>);
      if (!normalized) return;
      if (normalized.recipientId !== ctx.recipientStaffId) return;
      prependNotification(normalized);
    },
    consumeDeepLink(type: string | null, id: string | null) {
      if (!type || !id) return;
      const resourceType =
        type === "task" ? "task" : type === "project" ? "project" : type === "schedule" ? "schedule" : "";
      if (!resourceType) return;

      const notificationType =
        resourceType === "task"
          ? "TASK_ASSIGNED"
          : resourceType === "project"
            ? "PROJECT_ASSIGNED"
            : "SCHEDULE_INVITED";

      ctx.navigate({
        id: "",
        recipientId: ctx.recipientStaffId,
        type: notificationType,
        title: "",
        body: "",
        resourceType,
        resourceId: id,
        readAt: null,
        createdAt: new Date().toISOString(),
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("notify");
      url.searchParams.delete("id");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    },
  };
}
