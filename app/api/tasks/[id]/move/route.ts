import { proxyToTaskTracker } from "@/src/lib/api/proxy";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api/, "") + url.search;
  const body = await request.text();
  return proxyToTaskTracker(suffix, { method: "POST", body: body || undefined });
}
