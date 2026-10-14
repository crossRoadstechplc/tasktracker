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
    const ttError =
      "Could not open Task Operations for this Workforce account. Make sure you belong to an organization with employees.";
    console.log("[tt-auth] workforce login ok but no tracker staff", {
      status: ttRes.status,
      email: String(user.email ?? ""),
    });
    return NextResponse.json({ error: ttError }, { status: 403 });
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

  console.log("[tt-auth] login via workforce backend", {
    login: email,
    backend: process.env.BACKEND_API_BASE_URL ?? "http://localhost:4000/api/v1",
  });

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
    let data = unwrapPayload((await response.json().catch(() => ({}))) as JsonRecord);

    if (!response.ok) {
      console.log("[tt-auth] workforce login rejected", {
        status: response.status,
        message:
          typeof (data as { error?: { message?: string } }).error?.message === "string"
            ? (data as { error: { message: string } }).error.message
            : data.message,
      });
      const err =
        typeof (data as { error?: { message?: string } }).error?.message === "string"
          ? (data as { error: { message: string } }).error.message
          : typeof data.message === "string"
            ? data.message
            : "Invalid email or password.";
      return NextResponse.json({ error: err }, { status: response.status });
    }

    // Multi-role Workforce accounts need a context before cookies can be issued.
    // Auto-pick default (or first) context so Task Tracker stays Workforce-auth only.
    if (data.requiresContextSelection === true) {
      const contexts = Array.isArray(data.contexts) ? data.contexts : [];
      const defaultKey =
        typeof data.defaultContextKey === "string" && data.defaultContextKey
          ? data.defaultContextKey
          : null;
      const firstKey =
        contexts[0] && typeof contexts[0] === "object" && typeof (contexts[0] as JsonRecord).key === "string"
          ? String((contexts[0] as JsonRecord).key)
          : null;
      const contextKey = defaultKey || firstKey;
      const preAuthToken = typeof data.preAuthToken === "string" ? data.preAuthToken : null;

      console.log("[tt-auth] requires context selection — auto selecting", {
        contextKey,
        contextCount: contexts.length,
      });

      if (!contextKey || !preAuthToken) {
        return NextResponse.json(
          {
            error:
              "This Workforce account needs a role context, but none was available. Ask an admin to assign organization access.",
          },
          { status: 403 },
        );
      }

      const selectRes = await backendFetch("/auth/select-context", {
        method: "POST",
        body: JSON.stringify({
          preAuthToken,
          contextKey,
          deviceId: "task-tracker-web",
        }),
      });
      data = unwrapPayload((await selectRes.json().catch(() => ({}))) as JsonRecord);
      if (!selectRes.ok) {
        const err =
          typeof (data as { error?: { message?: string } }).error?.message === "string"
            ? (data as { error: { message: string } }).error.message
            : "Could not select Workforce login context.";
        return NextResponse.json({ error: err }, { status: selectRes.status });
      }
    }

    const accessToken = typeof data.accessToken === "string" ? data.accessToken : null;
    const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : null;
    if (!accessToken || !refreshToken) {
      console.log("[tt-auth] login response missing tokens", {
        keys: Object.keys(data),
      });
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
    if (!me.ok) {
      console.log("[tt-auth] workforce login ok but task-tracker membership missing", {
        status: me.status,
      });
      return me;
    }
    const meBody = await me.json();
    console.log("[tt-auth] login success (workforce users + task tracker staff)", {
      email: meBody?.user?.email,
      staff: meBody?.staffMember?.displayName,
      role: meBody?.staffMember?.permissionRole,
    });
    const res = NextResponse.json(meBody);
    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[tt-auth] login failed talking to workforce backend", error);
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
