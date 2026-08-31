import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession } from "@/src/lib/api/response";
import { serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { resendStaffInvite } from "@/src/lib/workspace/services/staff";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (
    session.auth.staffMember.permissionRole !== "Super Admin" &&
    session.auth.staffMember.permissionRole !== "Admin"
  ) {
    return jsonWithSession(
      { error: "Only Admins can resend invites." },
      {
        auth: session.auth,
        payload: session.payload,
        hadValidAccess: session.hadValidAccess,
        status: 403,
      },
    );
  }

  const { id } = await context.params;

  try {
    const result = await resendStaffInvite({
      actor: { userId: session.auth.user.id },
      staffId: id,
      adminName: session.auth.staffMember.displayName,
    });
    return jsonWithSession(result, {
      auth: session.auth,
      payload: session.payload,
      hadValidAccess: session.hadValidAccess,
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
