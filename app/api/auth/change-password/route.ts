import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import { getValidAccessToken, unwrapPayload } from "@/src/lib/api/proxy";

type JsonRecord = Record<string, unknown>;

export async function POST(request: Request) {
  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const session = await getValidAccessToken();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const response = await backendFetch("/auth/change-password", {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      currentPassword: body.currentPassword ?? body.oldPassword,
      newPassword: body.newPassword ?? body.password,
    }),
  });
  const data = unwrapPayload((await response.json().catch(() => ({}))) as JsonRecord);
  if (!response.ok) {
    const message =
      typeof (data as { error?: { message?: string } }).error?.message === "string"
        ? (data as { error: { message: string } }).error.message
        : "Could not change password.";
    return NextResponse.json({ error: message }, { status: response.status });
  }
  return NextResponse.json({ ok: true });
}
