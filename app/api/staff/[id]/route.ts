import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import {
  deleteStaffMember,
  updateStaffMember,
} from "@/src/lib/workspace/services/staff";

const patchSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  jobTitle: z.string().optional(),
  displayName: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "staff.edit");
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
    return NextResponse.json({ error: "Invalid staff payload." }, { status: 400 });
  }

  try {
    const result = await updateStaffMember({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      staffId: id,
      ...parsed.data,
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

export async function DELETE(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "staff.delete");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;
  if (id === session.auth.staffMember.id) {
    return NextResponse.json(
      { error: "You cannot remove your own account while signed in." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteStaffMember({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      staffId: id,
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
