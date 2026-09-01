import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { setOrgTeamMembers } from "@/src/lib/workspace/services/org-teams";

const membersSchema = z.object({
  memberIds: z.array(z.string()),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "teams.manageMembers");
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
    const result = await setOrgTeamMembers({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      orgTeamId: id,
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
