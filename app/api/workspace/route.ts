import { NextResponse } from "next/server";
import {
  attachRefreshedAccessCookieAsync,
  resolveAuthSession,
  setAccessTokenCookie,
} from "@/src/lib/auth/session";
import { workspaceRevisionHeaders } from "@/src/lib/api/response";
import { prisma } from "@/src/lib/prisma";
import { publishWorkspaceEvent } from "@/src/lib/realtime/notify";
import { getLegacyWorkspaceDataBySlug, getWorkspaceBySlug } from "@/src/lib/workspace/mapper";
import { applyPermittedWorkspaceUpdate } from "@/src/lib/workspace/permissions";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";
import { syncLegacyWorkspaceDataBySlug } from "@/src/lib/workspace/sync";
import { assertWorkspaceData } from "@/src/lib/workspace/validate";
import type { WorkspaceData } from "@/src/types/workspace";
import { getActorClientId } from "@/src/lib/api/route-helpers";

function parseWorkspaceBody(value: unknown): WorkspaceData {
  assertWorkspaceData(value);
  return value;
}

export async function GET() {
  const { auth, payload, hadValidAccess } = await resolveAuthSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const data = await getLegacyWorkspaceDataBySlug();

  if (!data) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const workspace = await getWorkspaceBySlug();
  const revision = workspace?.revision ?? 0;

  const response = NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
      ...workspaceRevisionHeaders(revision),
    },
  });
  await attachRefreshedAccessCookieAsync(response, payload, hadValidAccess);
  return response;
}

export async function PUT(request: Request) {
  const { auth, payload, hadValidAccess } = await resolveAuthSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let incoming: WorkspaceData;

  try {
    incoming = parseWorkspaceBody(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Invalid workspace payload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await getLegacyWorkspaceDataBySlug();
  if (!existing) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const permitted = applyPermittedWorkspaceUpdate({
    existing,
    incoming,
    role: auth.staffMember.permissionRole,
    actorDisplayName: auth.staffMember.displayName,
  });

  try {
    await syncLegacyWorkspaceDataBySlug(DEFAULT_WORKSPACE_SLUG, permitted);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const workspace = await getWorkspaceBySlug();
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const event = await publishWorkspaceEvent({
    type: "workspace.reload",
    workspaceId: workspace.id,
    actorUserId: auth.user.id,
    actorClientId: getActorClientId(request),
    resource: "workspace",
    resourceId: workspace.id,
    payload: { reason: "document_put" },
  });

  const response = NextResponse.json(
    { ok: true, revision: event.revision },
    { headers: workspaceRevisionHeaders(event.revision) },
  );

  const staffMember = await prisma.staffMember.findFirst({
    where: { userId: auth.user.id },
  });

  if (staffMember) {
    await setAccessTokenCookie(response, {
      sub: auth.user.id,
      email: auth.user.email,
      staffMemberId: staffMember.id,
    });
  } else {
    await attachRefreshedAccessCookieAsync(response, payload, hadValidAccess);
  }

  return response;
}
