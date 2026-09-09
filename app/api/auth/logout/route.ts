import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import { clearAuthCookies, readSessionCookies } from "@/src/lib/auth/bff-session";

export async function POST() {
  const { refreshToken } = await readSessionCookies();
  if (refreshToken) {
    try {
      await backendFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore upstream logout failures
    }
  }
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
