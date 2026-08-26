import { NextResponse } from "next/server";
import {
  attachRefreshedAccessCookieAsync,
  resolveAuthSession,
  setAccessTokenCookie,
} from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import { getLegacyWorkspaceDataBySlug } from "@/src/lib/workspace/mapper";
import { syncLegacyWorkspaceDataBySlug } from "@/src/lib/workspace/sync";
import { assertWorkspaceData } from "@/src/lib/workspace/validate";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";

export async function GET() {
  const { auth, payload, hadValidAccess } = await resolveAuthSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const data = await getLegacyWorkspaceDataBySlug();

  if (!data) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const response = NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    assertWorkspaceData(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid workspace payload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await syncLegacyWorkspaceDataBySlug(DEFAULT_WORKSPACE_SLUG, body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

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
