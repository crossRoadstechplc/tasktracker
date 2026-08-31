import { NextResponse } from "next/server";
import {
  attachRefreshedAccessCookieAsync,
  setAccessTokenCookie,
} from "@/src/lib/auth/session";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId } from "@/src/lib/api/route-helpers";
import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import { getWorkspaceBySlug } from "@/src/lib/workspace/mapper";
import { applyPermittedWorkspaceUpdate } from "@/src/lib/workspace/permissions";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";
import { syncLegacyWorkspaceDataBySlug } from "@/src/lib/workspace/sync";
import { assertWorkspaceData } from "@/src/lib/workspace/validate";
import type { WorkspaceData } from "@/src/types/workspace";

export async function POST(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "backup.import");
  if ("error" in allowed) return allowed.error;

  let incoming: WorkspaceData;
  try {
    const body = await request.json();
    if (
      body &&
      typeof body === "object" &&
      "data" in body &&
      (body as { app?: string }).app === "company-task-tracker"
    ) {
      assertWorkspaceData((body as { data: unknown }).data);
      incoming = (body as { data: WorkspaceData }).data;
    } else {
      assertWorkspaceData(body);
      incoming = body as WorkspaceData;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid import payload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { getLegacyWorkspaceDataBySlug } = await import("@/src/lib/workspace/mapper");
  const existing = await getLegacyWorkspaceDataBySlug();
  if (!existing) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const permitted = applyPermittedWorkspaceUpdate({
    existing,
    incoming,
    role: session.auth.staffMember.permissionRole,
    actorDisplayName: session.auth.staffMember.displayName,
  });

  try {
    await syncLegacyWorkspaceDataBySlug(DEFAULT_WORKSPACE_SLUG, permitted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const workspace = await getWorkspaceBySlug();
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const event = await publishWorkspaceEvent({
    type: "workspace.reload",
    workspaceId: workspace.id,
    actorUserId: session.auth.user.id,
    actorClientId: getActorClientId(request),
    resource: "workspace",
    resourceId: workspace.id,
    payload: { reason: "import" },
  });

  const response = NextResponse.json(
    { ok: true, revision: event.revision },
    { headers: workspaceRevisionHeaders(event.revision) },
  );

  const staffMember = await prisma.staffMember.findFirst({
    where: { userId: session.auth.user.id },
  });

  if (staffMember) {
    await setAccessTokenCookie(response, {
      sub: session.auth.user.id,
      email: session.auth.user.email,
      staffMemberId: staffMember.id,
    });
  } else {
    await attachRefreshedAccessCookieAsync(
      response,
      session.payload,
      session.hadValidAccess,
    );
  }

  return response;
}
