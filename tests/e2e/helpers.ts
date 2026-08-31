export class CookieJar {
  private cookies = new Map<string, string>();

  storeFromResponse(response: Response): void {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];

    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }

    // Fallback for environments without getSetCookie.
    const single = response.headers.get("set-cookie");
    if (single && setCookies.length === 0) {
      for (const part of single.split(/,(?=\s*[^;]+=)/)) {
        const [pair] = part.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) {
          this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
      }
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  clear(): void {
    this.cookies.clear();
  }
}

export function getBaseUrl(): string {
  const url =
    process.env.VITEST_E2E_BASE_URL ??
    process.env.E2E_BASE_URL ??
    "http://127.0.0.1:3000";
  return url.replace(/\/$/, "");
}

export async function apiFetch(
  jar: CookieJar,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  jar.storeFromResponse(response);
  return response;
}

export async function login(
  jar: CookieJar,
  email: string,
  password: string,
): Promise<Response> {
  return apiFetch(jar, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export const SUPER_ADMIN_EMAIL =
  process.env.VITEST_E2E_ADMIN_EMAIL ??
  process.env.E2E_ADMIN_EMAIL ??
  "e2e-super@tracker.local";
export const JUNIOR_EMAIL =
  process.env.VITEST_E2E_JUNIOR_EMAIL ??
  process.env.E2E_JUNIOR_EMAIL ??
  "e2e-junior@tracker.local";
export const DEFAULT_PASSWORD =
  process.env.VITEST_E2E_PASSWORD ?? process.env.E2E_PASSWORD ?? "ChangeMe123!";
export const E2E_JUNIOR_NAME = "E2E Junior";

export type WorkspaceData = {
  tasks: Array<{ id: string; title: string; status: string; team: string }>;
  staff: string[];
  staffProfiles: Record<string, { permissionRole: string }>;
  teams: string[];
  orgTeams: string[];
  deletedTasks: Array<{ id: string; trashId?: string }>;
  schedule: { events: Array<{ id: string; title: string; guests?: string[] }> };
  [key: string]: unknown;
};

export async function readSseEvent(
  jar: CookieJar,
  options: {
    afterRevision?: number;
    match: (event: { type: string; payload: Record<string, unknown> }) => boolean;
    timeoutMs?: number;
  },
): Promise<{ type: string; payload: Record<string, unknown> }> {
  const after = options.afterRevision ?? 0;
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}/api/events?after=${after}`, {
      headers: { Cookie: jar.header() },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE connect failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim() || block.startsWith(":")) continue;

        let eventType = "";
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          if (line.startsWith("data: ")) dataLine = line.slice(6);
        }

        if (!eventType || !dataLine) continue;

        const payload = JSON.parse(dataLine) as Record<string, unknown>;
        if (options.match({ type: eventType, payload })) {
          return { type: eventType, payload };
        }
      }
    }

    throw new Error("SSE stream ended before matching event");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
