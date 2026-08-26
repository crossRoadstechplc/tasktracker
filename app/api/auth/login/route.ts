import { Prisma } from "@/src/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getInviteTtlHours } from "@/src/lib/auth/mail";
import { verifyPassword } from "@/src/lib/auth/password";
import {
  issueAuthTokens,
  setAuthCookies,
} from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import { PERMISSION_ROLE_FROM_DB } from "@/src/lib/workspace/roles";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function isInviteExpired(invitedAt: Date | null): boolean {
  if (!invitedAt) return false;
  const expiresAt = new Date(invitedAt);
  expiresAt.setHours(expiresAt.getHours() + getInviteTtlHours());
  return Date.now() > expiresAt.getTime();
}

function loginErrorMessage(error: unknown): { message: string; status: number } {
  if (error instanceof Error && error.message === "JWT_SECRET is not set.") {
    return {
      message: "Server auth is not configured. Set JWT_SECRET in .env and restart the dev server.",
      status: 503,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1001" || error.code === "ETIMEDOUT") {
      return {
        message: "Could not reach the database. Check DATABASE_URL and your Neon connection.",
        status: 503,
      };
    }

    if (error.code === "P2021") {
      return {
        message: "Auth tables are missing. Run npm run db:migrate and npm run db:seed.",
        status: 503,
      };
    }
  }

  return {
    message: "Could not sign in right now. Try again in a moment.",
    status: 500,
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { staffMember: true },
    });

    if (!user || !user.staffMember) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (user.mustChangePassword && isInviteExpired(user.invitedAt)) {
      return NextResponse.json(
        {
          error: "This invite has expired. Ask an admin to send a new invite.",
        },
        { status: 403 },
      );
    }

    if (user.mustChangePassword) {
      return NextResponse.json(
        {
          error:
            "Please use the invite link from your email to set your password before signing in.",
        },
        { status: 403 },
      );
    }

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
  } catch (error) {
    console.error("Login failed.", error);
    const { message, status } = loginErrorMessage(error);
    return NextResponse.json({ error: message }, { status });
  }
}
