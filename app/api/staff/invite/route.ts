import { NextResponse } from "next/server";
import { z } from "zod";
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
import { resolveAuthSession } from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import {
  DEFAULT_WORKSPACE_SLUG,
  PERMISSION_ROLE_FROM_DB,
  PERMISSION_ROLE_LABELS,
  PERMISSION_ROLE_TO_DB,
  toPermissionRoleLabel,
} from "@/src/lib/workspace/roles";

const inviteSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().optional().default(""),
  email: z.string().trim().email(),
  jobTitle: z.string().trim().optional().default(""),
  permissionRole: z.string().optional(),
});

function canInvite(role: string): boolean {
  return role === "Super Admin" || role === "Admin";
}

export async function POST(request: Request) {
  const { auth } = await resolveAuthSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canInvite(auth.staffMember.permissionRole)) {
    return NextResponse.json(
      { error: "Only Admins can invite team members." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "First name and a valid email are required." },
      { status: 400 },
    );
  }

  const firstName = parsed.data.firstName.trim();
  const lastName = (parsed.data.lastName ?? "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = parsed.data.email.trim().toLowerCase();
  const jobTitle = (parsed.data.jobTitle ?? "").trim();
  const permissionRole = toPermissionRoleLabel(
    parsed.data.permissionRole ?? "Junior Staff",
  );

  if (!PERMISSION_ROLE_LABELS.includes(permissionRole)) {
    return NextResponse.json({ error: "Invalid permission role." }, { status: 400 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { staffMember: true },
  });

  if (existingUser?.staffMember) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const existingStaff = await prisma.staffMember.findUnique({
    where: {
      workspaceId_displayName: {
        workspaceId: workspace.id,
        displayName,
      },
    },
  });

  if (existingStaff) {
    return NextResponse.json(
      { error: `A team member named "${displayName}" already exists.` },
      { status: 409 },
    );
  }

  const inviteToken = createInviteToken();
  const inviteTokenHash = hashInviteToken(inviteToken);
  const ttlHours = getInviteTtlHours();
  const inviteExpiresAt = inviteExpiresAtFromNow(ttlHours);
  const loginUrl = getLoginUrl();
  const acceptUrl = getAcceptInviteUrl(inviteToken);

  // Placeholder hash until they accept the invite and set a real password.
  const passwordHash = await hashPassword(generateTempPassword(24));
  const maxSort = await prisma.staffMember.aggregate({
    where: { workspaceId: workspace.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  // Re-invite orphaned login left after a UI remove, or create a new account.
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          inviteTokenHash,
          inviteExpiresAt,
          invitedAt: new Date(),
          staffMember: {
            create: {
              workspaceId: workspace.id,
              displayName,
              firstName,
              lastName,
              jobTitle,
              permissionRole: PERMISSION_ROLE_TO_DB[permissionRole],
              sortOrder,
            },
          },
        },
        include: { staffMember: true },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          mustChangePassword: true,
          inviteTokenHash,
          inviteExpiresAt,
          invitedAt: new Date(),
          staffMember: {
            create: {
              workspaceId: workspace.id,
              displayName,
              firstName,
              lastName,
              jobTitle,
              permissionRole: PERMISSION_ROLE_TO_DB[permissionRole],
              sortOrder,
            },
          },
        },
        include: { staffMember: true },
      });

  if (!user.staffMember) {
    return NextResponse.json(
      { error: "Could not create team member account." },
      { status: 500 },
    );
  }

  const emailContent = buildInviteEmailContent({
    firstName,
    email,
    acceptUrl,
    loginUrl,
    adminName: auth.staffMember.displayName,
    ttlHours,
  });

  let emailSent = false;
  let emailError: string | null = null;

  if (isSmtpConfigured()) {
    try {
      await sendInviteEmail({
        to: email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      emailSent = true;
    } catch (error) {
      console.error("Invite email failed.", error);
      emailError =
        error instanceof Error ? error.message : "Could not send invite email.";
    }
  } else {
    emailError = "SMTP is not configured. Share the invite link manually.";
  }

  return NextResponse.json({
    email,
    acceptUrl,
    message: emailContent.text,
    emailSent,
    emailError,
    inviteTtlHours: ttlHours,
    loginUrl,
    staffMember: {
      id: user.staffMember.id,
      displayName: user.staffMember.displayName,
      firstName: user.staffMember.firstName,
      lastName: user.staffMember.lastName,
      jobTitle: user.staffMember.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[user.staffMember.permissionRole],
      email,
      inviteStatus: "pending" as const,
    },
  });
}
