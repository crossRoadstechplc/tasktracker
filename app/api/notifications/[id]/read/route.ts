import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/api/guard";
import { jsonWithSession } from "@/src/lib/api/response";
import { markNotificationRead } from "@/src/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const { id } = await context.params;
  const notification = await markNotificationRead(id, session.auth.staffMember.id);
  if (!notification) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  return jsonWithSession({ notification }, {
    auth: session.auth,
    payload: session.payload,
    hadValidAccess: session.hadValidAccess,
  });
}
