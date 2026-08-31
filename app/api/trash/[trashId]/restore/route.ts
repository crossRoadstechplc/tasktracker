import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { restoreTrashTask } from "@/src/lib/workspace/services/tasks";

type RouteContext = { params: Promise<{ trashId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "trash.restore");
  if ("error" in allowed) return allowed.error;

  const { trashId } = await context.params;

  try {
    const result = await restoreTrashTask({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      trashId,
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
