import { prisma } from "@/src/lib/prisma";
import {
  buildInviteEmailContent,
  createInviteToken,
  getAcceptInviteUrl,
  hashInviteToken,
  inviteExpiresAtFromNow,
} from "@/src/lib/auth/invite-token";
import {
  getInviteTtlHours,
  getLoginUrl,
  isSmtpConfigured,
  sendInviteEmail,
} from "@/src/lib/auth/mail";
import { generateTempPassword, hashPassword } from "@/src/lib/auth/password";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import { getDefaultWorkspace } from "@/src/lib/workspace/context";
import { mapStaffMemberResponse } from "@/src/lib/workspace/serialize";
import {
  PERMISSION_ROLE_TO_DB,
  toPermissionRoleLabel,
} from "@/src/lib/workspace/roles";
import type { PermissionRoleLabel } from "@/src/types/workspace";
import type { ActorContext } from "@/src/lib/workspace/services/tasks";

export async function updateStaffMember(input: {
  actor: ActorContext;
  staffId: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  displayName?: string;
}) {
  const workspace = await getDefaultWorkspace();
  const member = await prisma.staffMember.findFirst({
    where: { id: input.staffId, workspaceId: workspace.id },
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });
  if (!member) throw new Error("Staff member not found.");

  const firstName = input.firstName ?? member.firstName;
  const lastName = input.lastName ?? member.lastName;
  const displayName =
    input.displayName ??
    ([firstName, lastName].filter(Boolean).join(" ").trim() || member.displayName);

  const updated = await prisma.staffMember.update({
    where: { id: input.staffId },
    data: {
      firstName,
      lastName,
      displayName,
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
    },
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });

  const published = await publishWorkspaceEvent({
    type: "staff.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: updated.id,
    payload: mapStaffMemberResponse(updated),
  });

  return { staffMember: mapStaffMemberResponse(updated), revision: published.revision };
}

export async function updateStaffRole(input: {
  actor: ActorContext;
  staffId: string;
  permissionRole: PermissionRoleLabel;
}) {
  const workspace = await getDefaultWorkspace();
  const member = await prisma.staffMember.findFirst({
    where: { id: input.staffId, workspaceId: workspace.id },
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });
  if (!member) throw new Error("Staff member not found.");

  const updated = await prisma.staffMember.update({
    where: { id: input.staffId },
    data: {
      permissionRole:
        PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(input.permissionRole)],
    },
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });

  const published = await publishWorkspaceEvent({
    type: "staff.role.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: updated.id,
    payload: mapStaffMemberResponse(updated),
  });

  return { staffMember: mapStaffMemberResponse(updated), revision: published.revision };
}

export async function deleteStaffMember(input: {
  actor: ActorContext;
  staffId: string;
}) {
  const workspace = await getDefaultWorkspace();
  const member = await prisma.staffMember.findFirst({
    where: { id: input.staffId, workspaceId: workspace.id },
  });
  if (!member) throw new Error("Staff member not found.");

  const userId = member.userId;

  await prisma.$transaction(async (tx) => {
    await tx.staffMember.delete({ where: { id: input.staffId } });
    if (userId) {
      await tx.user.delete({ where: { id: userId } });
    }
  });

  const published = await publishWorkspaceEvent({
    type: "staff.deleted",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: input.staffId,
    payload: { id: input.staffId, displayName: member.displayName },
  });

  return { revision: published.revision };
}

export async function resendStaffInvite(input: {
  actor: ActorContext;
  staffId: string;
  adminName: string;
}) {
  const workspace = await getDefaultWorkspace();
  const member = await prisma.staffMember.findFirst({
    where: { id: input.staffId, workspaceId: workspace.id },
    include: { user: true },
  });
  if (!member?.user) throw new Error("Staff member has no login account.");

  const inviteToken = createInviteToken();
  const ttlHours = getInviteTtlHours();
  await prisma.user.update({
    where: { id: member.user.id },
    data: {
      mustChangePassword: true,
      inviteTokenHash: hashInviteToken(inviteToken),
      inviteExpiresAt: inviteExpiresAtFromNow(ttlHours),
      invitedAt: new Date(),
      passwordHash: await hashPassword(generateTempPassword(24)),
    },
  });

  const acceptUrl = getAcceptInviteUrl(inviteToken);
  const loginUrl = getLoginUrl();
  const emailContent = buildInviteEmailContent({
    firstName: member.firstName,
    email: member.user.email,
    acceptUrl,
    loginUrl,
    adminName: input.adminName,
    ttlHours,
  });

  let emailSent = false;
  let emailError: string | null = null;
  if (isSmtpConfigured()) {
    try {
      await sendInviteEmail({
        to: member.user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Could not send invite email.";
    }
  } else {
    emailError = "SMTP is not configured.";
  }

  return {
    acceptUrl,
    emailSent,
    emailError,
    message: emailContent.text,
  };
}

export async function updatePermissions(input: {
  actor: ActorContext;
  matrix: Record<string, Record<string, boolean>>;
}) {
  const workspace = await getDefaultWorkspace();

  const rows: Array<{
    workspaceId: string;
    role: (typeof PERMISSION_ROLE_TO_DB)[keyof typeof PERMISSION_ROLE_TO_DB];
    actionId: string;
    allowed: boolean;
  }> = [];

  for (const [roleLabel, actions] of Object.entries(input.matrix)) {
    const role = PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(roleLabel)];
    for (const [actionId, allowed] of Object.entries(actions)) {
      rows.push({
        workspaceId: workspace.id,
        role,
        actionId,
        allowed: Boolean(allowed),
      });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.permissionRule.deleteMany({ where: { workspaceId: workspace.id } });
      if (rows.length > 0) {
        await tx.permissionRule.createMany({ data: rows });
      }
    },
    { timeout: 15_000 },
  );

  const published = await publishWorkspaceEvent({
    type: "permissions.updated",
    workspaceId: workspace.id,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "permissions",
    resourceId: null,
    payload: input.matrix,
  });

  return { revision: published.revision };
}
