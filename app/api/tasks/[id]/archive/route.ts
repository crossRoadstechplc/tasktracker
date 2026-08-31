import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { archiveTask } from "@/src/lib/workspace/services/tasks";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.delete");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;

  try {
    const result = await archiveTask({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      taskId: id,
    });
    return jsonWithSession(
      { archivedId: result.archivedId, revision: result.revision },
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
