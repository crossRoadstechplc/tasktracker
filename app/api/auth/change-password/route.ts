import { NextResponse } from "next/server";
import { z } from "zod";
import { getInviteTtlHours } from "@/src/lib/auth/mail";
import { hashPassword, verifyPassword } from "@/src/lib/auth/password";
import {
  issueAuthTokens,
  setAuthCookies,
} from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import { PERMISSION_ROLE_FROM_DB } from "@/src/lib/workspace/roles";

const changePasswordSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

function isInviteExpired(invitedAt: Date | null): boolean {
  if (!invitedAt) return false;
  const expiresAt = new Date(invitedAt);
  expiresAt.setHours(expiresAt.getHours() + getInviteTtlHours());
  return Date.now() > expiresAt.getTime();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Email, current password, and new password are required." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { staffMember: true },
  });

  if (!user || !user.staffMember) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const passwordMatches = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (user.mustChangePassword && isInviteExpired(user.invitedAt)) {
    return NextResponse.json(
      { error: "This invite has expired. Ask an admin to send a new invite." },
      { status: 403 },
    );
  }

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json(
      { error: "Choose a new password that is different from the temporary one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
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
