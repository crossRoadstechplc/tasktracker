import { NextResponse } from "next/server";
import type { AuthUserResponse } from "@/src/lib/auth/types";
import { resolveAuthSession } from "@/src/lib/auth/session";
import {
  can,
  type PermissionActionId,
} from "@/src/lib/workspace/permissions";
import { getLegacyWorkspaceDataBySlug } from "@/src/lib/workspace/mapper";
import type { AccessTokenPayload } from "@/src/lib/auth/jwt";

export type SessionContext = {
  auth: AuthUserResponse;
  payload: AccessTokenPayload | null;
  hadValidAccess: boolean;
};

export async function requireSession(): Promise<
  { session: SessionContext } | { error: NextResponse }
> {
  const { auth, payload, hadValidAccess } = await resolveAuthSession();
  if (!auth) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  return { session: { auth, payload, hadValidAccess } };
}

export async function requirePermission(
  auth: AuthUserResponse,
  actionId: PermissionActionId,
): Promise<{ ok: true } | { error: NextResponse }> {
  const data = await getLegacyWorkspaceDataBySlug();
  if (!data) {
    return {
      error: NextResponse.json({ error: "Workspace not found." }, { status: 404 }),
    };
  }

  if (!can(auth.staffMember.permissionRole, actionId, data.permissionMatrix)) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true };
}
