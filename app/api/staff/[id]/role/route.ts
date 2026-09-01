import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { updateStaffRole } from "@/src/lib/workspace/services/staff";
import { toPermissionRoleLabel } from "@/src/lib/workspace/roles";

const roleSchema = z.object({
  permissionRole: z.string().trim().min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "staff.assignRole");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid permission role." }, { status: 400 });
  }

  try {
    const result = await updateStaffRole({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      staffId: id,
      permissionRole: toPermissionRoleLabel(parsed.data.permissionRole),
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
