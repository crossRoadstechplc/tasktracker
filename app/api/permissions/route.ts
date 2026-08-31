import { NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { updatePermissions } from "@/src/lib/workspace/services/staff";
import { validateWorkspaceData } from "@/src/lib/workspace/validate";

export async function PUT(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "settings.editPermissions");
  if ("error" in allowed) return allowed.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("permissionMatrix" in body) ||
    typeof (body as { permissionMatrix: unknown }).permissionMatrix !== "object"
  ) {
    return NextResponse.json({ error: "permissionMatrix is required." }, { status: 400 });
  }

  const matrix = (body as { permissionMatrix: Record<string, Record<string, boolean>> })
    .permissionMatrix;

  const probe = {
    tasks: [],
    teams: [],
    deletedTasks: [],
    archivedTasks: [],
    staff: [],
    staffProfiles: {},
    teamMembers: {},
    teamLeaders: {},
    orgTeams: [],
    orgTeamMembers: {},
    schedule: { events: [] },
    permissionMatrix: matrix,
  };
  const validationError = validateWorkspaceData(probe);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const result = await updatePermissions({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      matrix,
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
