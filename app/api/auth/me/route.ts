import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import {
  clearAuthCookies,
  getValidAccessToken,
  unwrapPayload,
} from "@/src/lib/api/proxy";

type JsonRecord = Record<string, unknown>;

export async function GET() {
  const session = await getValidAccessToken();
  if (!session) {
    const res = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const [wfRes, ttRes] = await Promise.all([
    backendFetch("/auth/me", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    }),
    backendFetch("/task-tracker/me", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    }),
  ]);

  if (!wfRes.ok) {
    const res = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const wf = unwrapPayload((await wfRes.json().catch(() => ({}))) as JsonRecord);
  const tt = ttRes.ok
    ? unwrapPayload((await ttRes.json().catch(() => ({}))) as JsonRecord)
    : null;

  const user =
    wf.user && typeof wf.user === "object"
      ? (wf.user as JsonRecord)
      : { id: wf.id, email: wf.email };

  const staffMember =
    tt && tt.staffMember && typeof tt.staffMember === "object"
      ? (tt.staffMember as JsonRecord)
      : null;

  if (!staffMember) {
    return NextResponse.json(
      {
        error:
          "Task Operations is not enabled for your organization, or you are not a member yet.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      user: {
        id: String(user.id ?? ""),
        email: String(user.email ?? ""),
      },
      staffMember: {
        id: String(staffMember.id ?? ""),
        displayName: String(staffMember.displayName ?? ""),
        firstName: String(staffMember.firstName ?? staffMember.displayName ?? ""),
        lastName: String(staffMember.lastName ?? ""),
        jobTitle: String(staffMember.jobTitle ?? ""),
        permissionRole: String(staffMember.permissionRole ?? "Junior Staff"),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
