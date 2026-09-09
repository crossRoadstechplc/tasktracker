import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import { clearAuthCookies, setAuthCookies, unwrapPayload } from "@/src/lib/api/proxy";

type JsonRecord = Record<string, unknown>;

async function composeMeResponse(accessToken: string): Promise<NextResponse> {
  const [wfRes, ttRes] = await Promise.all([
    backendFetch("/auth/me", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
    backendFetch("/task-tracker/me", {
      headers: { authorization: `Bearer ${accessToken}` },
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

  return NextResponse.json({
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
  });
}

export async function POST(request: Request) {
  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email =
    typeof body.email === "string"
      ? body.email.trim()
      : typeof body.login === "string"
        ? body.login.trim()
        : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const payload: JsonRecord = {
      login: email,
      password,
      deviceId: "task-tracker-web",
    };
    if (typeof body.organizationSlug === "string" && body.organizationSlug.trim()) {
      payload.organizationSlug = body.organizationSlug.trim();
    }
    if (typeof body.contextKey === "string" && body.contextKey.trim()) {
      payload.contextKey = body.contextKey.trim();
    }

    const response = await backendFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = unwrapPayload((await response.json().catch(() => ({}))) as JsonRecord);

    if (!response.ok) {
      const err =
        typeof (data as { error?: { message?: string } }).error?.message === "string"
          ? (data as { error: { message: string } }).error.message
          : typeof data.message === "string"
            ? data.message
            : "Invalid email or password.";
      return NextResponse.json({ error: err }, { status: response.status });
    }

    if (data.requiresContextSelection === true) {
      return NextResponse.json({
        requiresContextSelection: true,
        preAuthToken: data.preAuthToken,
        contexts: data.contexts,
        defaultContextKey: data.defaultContextKey ?? null,
      });
    }

    const accessToken = typeof data.accessToken === "string" ? data.accessToken : null;
    const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : null;
    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "Login response incomplete." }, { status: 502 });
    }

    if (data.mustChangePassword === true) {
      const res = NextResponse.json({
        requiresPasswordChange: true,
        email,
      });
      setAuthCookies(res, accessToken, refreshToken);
      return res;
    }

    const me = await composeMeResponse(accessToken);
    if (!me.ok) return me;
    const meBody = await me.json();
    const res = NextResponse.json(meBody);
    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "Login timed out talking to the API."
          : "Login could not reach the workforce API. Check BACKEND_API_BASE_URL.",
      },
      { status: 502 },
    );
  }
}
