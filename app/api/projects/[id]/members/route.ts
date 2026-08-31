import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { setProjectMembers } from "@/src/lib/workspace/services/projects";

const membersSchema = z.object({
  memberIds: z.array(z.string()),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "projects.manageMembers");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = membersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "memberIds array is required." }, { status: 400 });
  }

  try {
    const result = await setProjectMembers({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      projectId: id,
      memberIds: parsed.data.memberIds,
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
