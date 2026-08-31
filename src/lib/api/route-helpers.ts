import { NextResponse } from "next/server";

export function getActorClientId(request: Request): string | null {
  return request.headers.get("x-client-id")?.trim() || null;
}

export function serviceErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Request failed.";
  let status = 500;
  if (/not found/i.test(message)) status = 404;
  else if (/forbidden|cannot delete|unknown project|unknown owner/i.test(message)) status = 400;
  else if (message.startsWith("Unknown")) status = 400;
  return NextResponse.json({ error: message }, { status });
}
