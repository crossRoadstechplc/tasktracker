import { NextResponse } from "next/server";
import {
  attachRefreshedAccessCookieAsync,
  setAccessTokenCookie,
} from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import type { AccessTokenPayload } from "@/src/lib/auth/jwt";
import type { AuthUserResponse } from "@/src/lib/auth/types";

export function workspaceRevisionHeaders(revision: number): HeadersInit {
  return {
    ETag: `"${revision}"`,
    "X-Workspace-Revision": String(revision),
  };
}

export async function jsonWithSession(
  body: unknown,
  init: {
    status?: number;
    headers?: HeadersInit;
    auth: AuthUserResponse;
    payload: AccessTokenPayload | null;
    hadValidAccess: boolean;
    refreshAccess?: boolean;
  },
): Promise<NextResponse> {
  const response = NextResponse.json(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });

  if (init.refreshAccess) {
    const staffMember = await prisma.staffMember.findFirst({
      where: { userId: init.auth.user.id },
    });
    if (staffMember) {
      await setAccessTokenCookie(response, {
        sub: init.auth.user.id,
        email: init.auth.user.email,
        staffMemberId: staffMember.id,
      });
    } else {
      await attachRefreshedAccessCookieAsync(
        response,
        init.payload,
        init.hadValidAccess,
      );
    }
  } else {
    await attachRefreshedAccessCookieAsync(
      response,
      init.payload,
      init.hadValidAccess,
    );
  }

  return response;
}
