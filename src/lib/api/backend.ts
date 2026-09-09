const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const url =
  process.env.BACKEND_API_BASE_URL ??
  (publicBase?.startsWith("http") ? publicBase : undefined) ??
  "http://localhost:4000/api/v1";

export function getBackendBaseUrl(): string {
  return url.replace(/\/$/, "");
}

/** Flatten Headers | string[][] | Record into a plain object (spread of Headers drops Authorization). */
function normalizeHeaders(input?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;

  if (input instanceof Headers) {
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  if (Array.isArray(input)) {
    for (const [key, value] of input) {
      out[key] = value;
    }
    return out;
  }

  return { ...input };
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const headers = {
    "content-type": "application/json",
    ...normalizeHeaders(init?.headers),
  };
  try {
    return await fetch(`${getBackendBaseUrl()}${normalized}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}
