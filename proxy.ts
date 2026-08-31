import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/src/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/change-password", "/accept-invite"];
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/change-password",
  "/api/auth/accept-invite",
];

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hasRefreshCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);
}

async function hasValidAccessToken(request: NextRequest): Promise<boolean> {
  const secret = getJwtSecret();
  if (!secret) return false;

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return false;

  try {
    await jwtVerify(accessToken, secret);
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (
      pathname === "/login" &&
      ((await hasValidAccessToken(request)) || hasRefreshCookie(request))
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // API routes validate and refresh sessions themselves.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const accessValid = await hasValidAccessToken(request);
  if (!accessValid && !hasRefreshCookie(request)) {
    return redirectToLogin(request, pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
