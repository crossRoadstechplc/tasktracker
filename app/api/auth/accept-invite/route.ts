import { NextResponse } from "next/server";
import { z } from "zod";
import { hashInviteToken } from "@/src/lib/auth/invite-token";
import { hashPassword } from "@/src/lib/auth/password";
import {
  issueAuthTokens,
  setAuthCookies,
} from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import { PERMISSION_ROLE_FROM_DB } from "@/src/lib/workspace/roles";

const acceptInviteSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Invite token and new password are required." },
      { status: 400 },
    );
  }

  const tokenHash = hashInviteToken(parsed.data.token);
  const user = await prisma.user.findUnique({
    where: { inviteTokenHash: tokenHash },
    include: { staffMember: true },
  });

  if (!user || !user.staffMember) {
    return NextResponse.json(
      { error: "This invite link is invalid or has already been used." },
      { status: 400 },
    );
  }

  if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This invite has expired. Ask an admin to send a new invite." },
      { status: 403 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });

  const { accessToken, refreshToken } = await issueAuthTokens({
    id: user.id,
    email: user.email,
    staffMember: { id: user.staffMember.id },
  });

  const response = NextResponse.json({
    user: { id: user.id, email: user.email },
    staffMember: {
      id: user.staffMember.id,
      displayName: user.staffMember.displayName,
      firstName: user.staffMember.firstName,
      lastName: user.staffMember.lastName,
      jobTitle: user.staffMember.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[user.staffMember.permissionRole],
    },
  });

  setAuthCookies(response, accessToken, refreshToken);
  return response;
}
