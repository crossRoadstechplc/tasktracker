import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { actorFromAuth, getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { deleteProject, updateProject } from "@/src/lib/workspace/services/projects";

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  leaderId: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "projects.rename");
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
    return NextResponse.json({ error: "Invalid project payload." }, { status: 400 });
  }

  try {
    const result = await updateProject({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      projectId: id,
      ...parsed.data,
    });
    return jsonWithSession(
      { id: result.id, revision: result.revision },
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

  const allowed = await requirePermission(session.auth, "projects.delete");
  if ("error" in allowed) return allowed.error;

  const { id } = await context.params;

  try {
    const result = await deleteProject({
      actor: actorFromAuth(session.auth, getActorClientId(request)),
      projectId: id,
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
