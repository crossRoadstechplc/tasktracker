import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_DAYS,
} from "@/src/lib/auth/constants";

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

export async function readSessionCookies(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_TOKEN_COOKIE)?.value ?? null,
    refreshToken: jar.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
  };
}

/** In-memory access token store is not used; both tokens live in httpOnly cookies (workforce JWTs). */
export function applySetCookieFromUpstream(
  response: NextResponse,
  accessToken?: string | null,
  refreshToken?: string | null,
): void {
  if (accessToken) {
    response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: AUTH_COOKIE_PATH,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
  if (refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: AUTH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    });
  }
}
