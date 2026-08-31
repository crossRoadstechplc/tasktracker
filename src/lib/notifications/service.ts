import { prisma } from "@/src/lib/prisma";
import type { NotificationType } from "@/src/generated/prisma/client";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import {
  getAdminPortalUrl,
  isSmtpConfigured,
  sendInviteEmail,
} from "@/src/lib/auth/mail";
import { buildAssignmentEmailContent } from "@/src/lib/auth/assignment-email";

export type NotificationRecord = {
  id: string;
  workspaceId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  actorStaffId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function getNewAssigneeIds(
  before: Set<string>,
  after: string[],
  actorStaffId: string | null,
): string[] {
  return after.filter(
    (id) => !before.has(id) && (actorStaffId === null || id !== actorStaffId),
  );
}

export async function resolveActorStaffId(
  workspaceId: string,
  actorUserId: string | null | undefined,
): Promise<string | null> {
  if (!actorUserId) return null;
  const member = await prisma.staffMember.findFirst({
    where: { workspaceId, userId: actorUserId },
    select: { id: true },
  });
  return member?.id ?? null;
}

function formatScheduleDate(startIso: string): string {
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return startIso;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildNotificationCopy(input: {
  type: NotificationType;
  resourceLabel: string;
  scheduleStart?: string;
}): { title: string; body: string } {
  switch (input.type) {
    case "TASK_ASSIGNED":
      return {
        title: "Task assignment",
        body: `You were assigned to "${input.resourceLabel}".`,
      };
    case "PROJECT_ASSIGNED":
      return {
        title: "Project assignment",
        body: `You were added to project "${input.resourceLabel}".`,
      };
    case "SCHEDULE_INVITED":
      return {
        title: "Schedule invitation",
        body: input.scheduleStart
          ? `You were invited to "${input.resourceLabel}" on ${formatScheduleDate(input.scheduleStart)}.`
          : `You were invited to "${input.resourceLabel}".`,
      };
    default:
      return {
        title: "Notification",
        body: input.resourceLabel,
      };
  }
}

function resourceTypeForNotification(type: NotificationType): string {
  switch (type) {
    case "TASK_ASSIGNED":
      return "task";
    case "PROJECT_ASSIGNED":
      return "project";
    case "SCHEDULE_INVITED":
      return "schedule";
    default:
      return "unknown";
  }
}

function notifyQueryParam(type: NotificationType): string {
  switch (type) {
    case "TASK_ASSIGNED":
      return "task";
    case "PROJECT_ASSIGNED":
      return "project";
    case "SCHEDULE_INVITED":
      return "schedule";
    default:
      return "task";
  }
}

function mapNotificationRow(row: {
  id: string;
  workspaceId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  actorStaffId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientId: row.recipientId,
    type: row.type,
    title: row.title,
    body: row.body,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorStaffId: row.actorStaffId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function deliverNotificationEmail(input: {
  notification: NotificationRecord;
  recipientEmail: string;
  recipientFirstName: string;
  actorName: string | null;
}): Promise<void> {
  if (!isSmtpConfigured()) {
    console.warn("Assignment notification email skipped: SMTP is not configured.");
    return;
  }

  const notifyType = notifyQueryParam(input.notification.type);
  const link = `${getAdminPortalUrl()}/?notify=${notifyType}&id=${encodeURIComponent(input.notification.resourceId)}`;
  const emailContent = buildAssignmentEmailContent({
    firstName: input.recipientFirstName,
    email: input.recipientEmail,
    title: input.notification.title,
    body: input.notification.body,
    link,
    actorName: input.actorName ?? undefined,
  });

  await sendInviteEmail({
    to: input.recipientEmail,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}

async function publishNotificationCreated(
  notification: NotificationRecord,
  actorUserId: string | null,
  actorClientId: string | null,
): Promise<void> {
  await publishWorkspaceEvent({
    type: "notification.created",
    workspaceId: notification.workspaceId,
    actorUserId,
    actorClientId,
    resource: "notification",
    resourceId: notification.id,
    payload: notification,
  });
}

export async function createAssignmentNotifications(input: {
  workspaceId: string;
  type: NotificationType;
  resourceId: string;
  resourceLabel: string;
  scheduleStart?: string;
  recipientIds: string[];
  actorUserId?: string | null;
  actorClientId?: string | null;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const actorStaffId = await resolveActorStaffId(input.workspaceId, input.actorUserId);
  const actorMember = actorStaffId
    ? await prisma.staffMember.findFirst({
        where: { id: actorStaffId },
        select: { displayName: true },
      })
    : null;
  const { title, body } = buildNotificationCopy({
    type: input.type,
    resourceLabel: input.resourceLabel,
    scheduleStart: input.scheduleStart,
  });
  const resourceType = resourceTypeForNotification(input.type);

  const recipients = await prisma.staffMember.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { in: input.recipientIds },
    },
    select: {
      id: true,
      firstName: true,
      displayName: true,
      user: { select: { email: true } },
    },
  });

  for (const recipient of recipients) {
    const row = await prisma.notification.create({
      data: {
        workspaceId: input.workspaceId,
        recipientId: recipient.id,
        type: input.type,
        title,
        body,
        resourceType,
        resourceId: input.resourceId,
        actorStaffId,
      },
    });

    const notification = mapNotificationRow(row);

    await publishNotificationCreated(
      notification,
      input.actorUserId ?? null,
      input.actorClientId ?? null,
    );

    const recipientEmail = recipient.user?.email?.trim();
    if (recipientEmail) {
      void deliverNotificationEmail({
        notification,
        recipientEmail,
        recipientFirstName: recipient.firstName || recipient.displayName,
        actorName: actorMember?.displayName ?? null,
      }).catch((error) => {
        console.error("Could not send assignment notification email.", error);
      });
    }
  }
}

export async function listNotificationsForRecipient(
  recipientId: string,
  limit = 50,
): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { recipientId, readAt: null },
    }),
  ]);

  const notifications = rows
    .map(mapNotificationRow)
    .sort((a, b) => {
      const aUnread = a.readAt === null ? 0 : 1;
      const bUnread = b.readAt === null ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return { notifications, unreadCount };
}

export async function markNotificationRead(
  notificationId: string,
  recipientId: string,
): Promise<NotificationRecord | null> {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId },
  });
  if (!existing) return null;

  const row = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: existing.readAt ?? new Date() },
  });

  return mapNotificationRow(row);
}

export async function markAllNotificationsRead(recipientId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
