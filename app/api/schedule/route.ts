import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { createScheduleEvent } from "@/src/lib/workspace/services/schedule";

const createSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  project: z.string().optional(),
  color: z.string(),
  guests: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "schedule.create");
  if ("error" in allowed) return allowed.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule payload." }, { status: 400 });
  }

  try {
    const result = await createScheduleEvent({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      event: {
        title: parsed.data.title,
        start: parsed.data.start,
        end: parsed.data.end,
        allDay: parsed.data.allDay ?? false,
        description: parsed.data.description ?? "",
        location: parsed.data.location ?? "",
        project: parsed.data.project ?? "",
        color: parsed.data.color,
        guests: parsed.data.guests ?? [],
        id: parsed.data.id,
      },
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
