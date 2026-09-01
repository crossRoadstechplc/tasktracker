import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { addTaskUpdate } from "@/src/lib/workspace/services/tasks";

const updateSchema = z.object({
  text: z.string().trim().min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.addUpdate");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Update text is required." }, { status: 400 });
  }

  try {
    const result = await addTaskUpdate({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      taskId: id,
      text: parsed.data.text,
      staffMemberId: session.auth.staffMember.id,
    });
    return jsonWithSession(
      { task: result.task, revision: result.revision },
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
