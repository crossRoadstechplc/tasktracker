import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { deleteTask, updateTask } from "@/src/lib/workspace/services/tasks";

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  team: z.string().optional(),
  priority: z.string().optional(),
  due: z.string().optional(),
  owners: z.array(z.string()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.edit");
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
    return NextResponse.json({ error: "Invalid task payload." }, { status: 400 });
  }

  try {
    const result = await updateTask({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
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

export async function DELETE(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.delete");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;

  try {
    const result = await deleteTask({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      taskId: id,
    });
    return jsonWithSession(
      { trashId: result.trashId, revision: result.revision },
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
