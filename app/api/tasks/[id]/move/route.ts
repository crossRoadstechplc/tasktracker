import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { moveTask } from "@/src/lib/workspace/services/tasks";

const moveSchema = z.object({
  status: z.enum(["To Do", "In Progress", "Done"]),
  sortOrder: z.number().int().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.move");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid move payload." }, { status: 400 });
  }

  try {
    const result = await moveTask({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      taskId: id,
      ...parsed.data,
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
