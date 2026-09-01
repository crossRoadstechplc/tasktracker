import { NextResponse } from "next/server";
import { ForbiddenError } from "@/src/lib/workspace/visibility";
import type { AuthUserResponse } from "@/src/lib/auth/types";
import type { ActorContext } from "@/src/lib/workspace/services/tasks";

export function getActorClientId(request: Request): string | null {
  return request.headers.get("x-client-id")?.trim() || null;
}

export function actorFromAuth(
  auth: AuthUserResponse,
  clientId?: string | null,
): ActorContext {
  return {
    userId: auth.user.id,
    clientId: clientId ?? null,
    staffMemberId: auth.staffMember.id,
    permissionRole: auth.staffMember.permissionRole,
  };
}

export function serviceErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Request failed.";
  let status = 500;
  if (error instanceof ForbiddenError || /do not have access/i.test(message)) status = 403;
  else if (/not found/i.test(message)) status = 404;
  else if (/forbidden|cannot delete|unknown project|unknown owner/i.test(message)) status = 400;
  else if (message.startsWith("Unknown")) status = 400;
  return NextResponse.json({ error: message }, { status });
}
