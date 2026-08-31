import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/api/guard";
import { jsonWithSession } from "@/src/lib/api/response";
import { markAllNotificationsRead } from "@/src/lib/notifications/service";

export async function PATCH() {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const updated = await markAllNotificationsRead(session.auth.staffMember.id);

  return jsonWithSession({ ok: true, updated }, {
    auth: session.auth,
    payload: session.payload,
    hadValidAccess: session.hadValidAccess,
  });
}
