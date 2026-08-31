import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { createOrgTeam } from "@/src/lib/workspace/services/org-teams";

const createSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "teams.create");
  if ("error" in allowed) return allowed.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }

  try {
    const result = await createOrgTeam({
      actor: { userId: session.auth.user.id, clientId: getActorClientId(request) },
      name: parsed.data.name,
    });
    return jsonWithSession(result, {
      auth: session.auth,
      payload: session.payload,
      hadValidAccess: session.hadValidAccess,
      headers: workspaceRevisionHeaders(result.revision),
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
