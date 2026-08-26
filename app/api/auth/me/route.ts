import { NextResponse } from "next/server";
import {
  attachRefreshedAccessCookieAsync,
  clearAuthCookies,
  resolveAuthSession,
} from "@/src/lib/auth/session";

export async function GET() {
  const { auth, payload, hadValidAccess } = await resolveAuthSession();
  if (!auth) {
    const response = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json(auth, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
  await attachRefreshedAccessCookieAsync(response, payload, hadValidAccess);
  return response;
}
