import { proxyToTaskTracker } from "@/src/lib/api/proxy";

/** Vercel serverless max for SSE proxy (Pro plan can raise further in vercel.json). */
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  return proxyToTaskTracker(suffix, { method: "GET" });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  const body = await request.text();
  return proxyToTaskTracker(suffix, { method: "POST", body: body || undefined });
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  const body = await request.text();
  return proxyToTaskTracker(suffix, { method: "PUT", body: body || undefined });
}

export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  const body = await request.text();
  return proxyToTaskTracker(suffix, { method: "PATCH", body: body || undefined });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  const body = await request.text();
  return proxyToTaskTracker(suffix, { method: "DELETE", body: body || undefined });
}
