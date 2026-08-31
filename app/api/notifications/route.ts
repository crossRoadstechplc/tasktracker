import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/api/guard";
import { jsonWithSession } from "@/src/lib/api/response";
import {
  listNotificationsForRecipient,
} from "@/src/lib/notifications/service";

export async function GET() {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const result = await listNotificationsForRecipient(session.auth.staffMember.id);

  return jsonWithSession(result, {
    auth: session.auth,
    payload: session.payload,
    hadValidAccess: session.hadValidAccess,
  });
}
