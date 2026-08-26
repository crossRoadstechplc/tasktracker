import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_DAYS,
} from "@/src/lib/auth/constants";
import {
  createRefreshTokenValue,
  hashRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from "@/src/lib/auth/jwt";
import { prisma } from "@/src/lib/prisma";
import { PERMISSION_ROLE_FROM_DB } from "@/src/lib/workspace/roles";
import type { AuthUserResponse } from "@/src/lib/auth/types";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: AUTH_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: AUTH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: AUTH_COOKIE_PATH,
    maxAge: 0,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: AUTH_COOKIE_PATH,
    maxAge: 0,
  });
}

export async function issueAuthTokens(user: {
  id: string;
  email: string;
  staffMember: { id: string };
}): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    staffMemberId: user.staffMember.id,
  });

  const refreshToken = createRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
}

export async function getAccessTokenPayloadFromCookies(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  try {
    return await verifyAccessToken(accessToken);
  } catch {
    return null;
  }
}

export async function refreshSessionFromCookies(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: {
      user: {
        include: {
          staffMember: true,
        },
      },
    },
  });

  if (!stored || stored.expiresAt < new Date() || !stored.user.staffMember) {
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }
    return null;
  }

  return {
    sub: stored.user.id,
    email: stored.user.email,
    staffMemberId: stored.user.staffMember.id,
  };
}

export async function getAuthenticatedUser(): Promise<AuthUserResponse | null> {
  let payload = await getAccessTokenPayloadFromCookies();
  if (!payload) {
    payload = await refreshSessionFromCookies();
  }
  if (!payload) return null;

  let staffMember = await prisma.staffMember.findUnique({
    where: { id: payload.staffMemberId },
  });

  if (!staffMember) {
    staffMember = await prisma.staffMember.findFirst({
      where: { userId: payload.sub },
    });
  }

  if (!staffMember) return null;

  return {
    user: {
      id: payload.sub,
      email: payload.email,
    },
    staffMember: {
      id: staffMember.id,
      displayName: staffMember.displayName,
      firstName: staffMember.firstName,
      lastName: staffMember.lastName,
      jobTitle: staffMember.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[staffMember.permissionRole],
    },
  };
}

export async function attachRefreshedAccessCookieAsync(
  response: NextResponse,
  payload: AccessTokenPayload | null,
  hadValidAccess: boolean,
): Promise<void> {
  if (payload && !hadValidAccess) {
    const accessToken = await signAccessToken(payload);
    response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: AUTH_COOKIE_PATH,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}

export async function setAccessTokenCookie(
  response: NextResponse,
  payload: AccessTokenPayload,
): Promise<void> {
  const accessToken = await signAccessToken(payload);
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: AUTH_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export async function resolveAuthSession(): Promise<{
  auth: AuthUserResponse | null;
  payload: AccessTokenPayload | null;
  hadValidAccess: boolean;
}> {
  const hadValidAccess = Boolean(await getAccessTokenPayloadFromCookies());
  let payload = await getAccessTokenPayloadFromCookies();

  if (!payload) {
    payload = await refreshSessionFromCookies();
  }

  if (!payload) {
    return { auth: null, payload: null, hadValidAccess };
  }

  let staffMember = await prisma.staffMember.findUnique({
    where: { id: payload.staffMemberId },
  });

  if (!staffMember) {
    staffMember = await prisma.staffMember.findFirst({
      where: { userId: payload.sub },
    });
    if (staffMember) {
      payload = {
        ...payload,
        staffMemberId: staffMember.id,
      };
    }
  }

  if (!staffMember) {
    return { auth: null, payload: null, hadValidAccess };
  }

  const auth: AuthUserResponse = {
    user: {
      id: payload.sub,
      email: payload.email,
    },
    staffMember: {
      id: staffMember.id,
      displayName: staffMember.displayName,
      firstName: staffMember.firstName,
      lastName: staffMember.lastName,
      jobTitle: staffMember.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[staffMember.permissionRole],
    },
  };

  return { auth, payload, hadValidAccess };
}

export async function requireAuthenticatedUser(): Promise<AuthUserResponse> {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    throw new Error("Unauthorized");
  }
  return auth;
}
