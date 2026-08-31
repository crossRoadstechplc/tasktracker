import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import {
  deleteScheduleEvent,
  updateScheduleEvent,
} from "@/src/lib/workspace/services/schedule";

const patchSchema = z.object({
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  project: z.string().optional(),
  color: z.string().optional(),
  guests: z.array(z.string()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "schedule.edit");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule payload." }, { status: 400 });
  }

  try {
    const result = await updateScheduleEvent({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      eventId: id,
      patch: parsed.data,
    });
    return jsonWithSession(
      { event: result.event, revision: result.revision },
      {
        auth: session.auth,
        payload: session.payload,
        hadValidAccess: session.hadValidAccess,
        headers: workspaceRevisionHeaders(result.revision),
      },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "schedule.delete");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;

  try {
    const result = await deleteScheduleEvent({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      eventId: id,
    });
    return jsonWithSession(
      { ok: true, revision: result.revision },
      {
        auth: session.auth,
        payload: session.payload,
        hadValidAccess: session.hadValidAccess,
        headers: workspaceRevisionHeaders(result.revision),
      },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
