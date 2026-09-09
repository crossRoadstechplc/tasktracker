import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import {
  applySetCookieFromUpstream,
  clearAuthCookies,
  readSessionCookies,
  setAuthCookies,
} from "@/src/lib/auth/bff-session";

type JsonRecord = Record<string, unknown>;

function unwrapPayload(data: JsonRecord): JsonRecord {
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    return data.data as JsonRecord;
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
} | null> {
  const response = await backendFetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken, deviceId: "task-tracker-web" }),
  });
  if (!response.ok) return null;
  const data = unwrapPayload((await response.json().catch(() => ({}))) as JsonRecord);
  if (typeof data.accessToken !== "string") return null;
  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : undefined,
  };
}

export async function getValidAccessToken(): Promise<{
  accessToken: string;
  refreshToken: string | null;
  rotatedRefresh?: string;
} | null> {
  const { accessToken, refreshToken } = await readSessionCookies();
  if (accessToken) {
    return { accessToken, refreshToken };
  }
  if (!refreshToken) return null;
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed) return null;
  return {
    accessToken: refreshed.accessToken,
    refreshToken,
    rotatedRefresh: refreshed.refreshToken,
  };
}

export async function proxyToTaskTracker(
  path: string,
  init?: RequestInit & { rawBody?: BodyInit | null },
): Promise<NextResponse> {
  const session = await getValidAccessToken();
  if (!session) {
    const res = NextResponse.json({ error: "Authentication required." }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${session.accessToken}`,
  };
  if (init?.body && typeof init.body === "string") {
    headers["content-type"] = "application/json";
  }
  if (init?.headers) {
    const extra =
      init.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : Array.isArray(init.headers)
          ? Object.fromEntries(init.headers)
          : { ...init.headers };
    Object.assign(headers, extra);
    headers.authorization = `Bearer ${session.accessToken}`;
  }

  let upstream = await backendFetch(`/task-tracker${path}`, {
    ...init,
    headers,
    body: init?.rawBody !== undefined ? init.rawBody : init?.body,
  });

  // Retry once after refresh if unauthorized
  if (upstream.status === 401 && session.refreshToken) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    if (refreshed) {
      headers.authorization = `Bearer ${refreshed.accessToken}`;
      upstream = await backendFetch(`/task-tracker${path}`, {
        ...init,
        headers,
        body: init?.rawBody !== undefined ? init.rawBody : init?.body,
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        return streamProxyResponse(upstream, refreshed.accessToken, refreshed.refreshToken);
      }
      const bodyText = await upstream.text();
      const res = new NextResponse(bodyText, {
        status: upstream.status,
        headers: { "content-type": contentType || "application/json" },
      });
      applySetCookieFromUpstream(res, refreshed.accessToken, refreshed.refreshToken);
      return res;
    }
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return streamProxyResponse(
      upstream,
      session.rotatedRefresh ? session.accessToken : null,
      session.rotatedRefresh,
    );
  }

  const bodyText = await upstream.text();
  const res = new NextResponse(bodyText, {
    status: upstream.status,
    headers: { "content-type": contentType || "application/json" },
  });
  if (session.rotatedRefresh) {
    applySetCookieFromUpstream(res, session.accessToken, session.rotatedRefresh);
  }
  return res;
}

function streamProxyResponse(
  upstream: Response,
  accessToken?: string | null,
  refreshToken?: string | null,
): NextResponse {
  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
  if (accessToken || refreshToken) {
    applySetCookieFromUpstream(res, accessToken, refreshToken);
  }
  return res;
}

export { setAuthCookies, clearAuthCookies, unwrapPayload };
