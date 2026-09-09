import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";
import { setAuthCookies, unwrapPayload } from "@/src/lib/api/proxy";

type JsonRecord = Record<string, unknown>;

/** Consume a one-time exchange token from Admin Portal / Employee App. */
export async function POST(request: Request) {
  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const exchangeToken =
    typeof body.exchangeToken === "string" ? body.exchangeToken.trim() : "";
  if (!exchangeToken) {
    return NextResponse.json({ error: "exchangeToken is required." }, { status: 400 });
  }

  try {
    const response = await backendFetch("/task-tracker/session/consume", {
      method: "POST",
      body: JSON.stringify({ exchangeToken }),
    });
    const data = unwrapPayload((await response.json().catch(() => ({}))) as JsonRecord);
    if (!response.ok) {
      const message =
        typeof (data as { error?: { message?: string } }).error?.message === "string"
          ? (data as { error: { message: string } }).error.message
          : "Invalid or expired handoff token.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const accessToken = typeof data.accessToken === "string" ? data.accessToken : null;
    const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : null;
    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "Handoff response incomplete." }, { status: 502 });
    }

    const res = NextResponse.json({ ok: true });
    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Could not complete handoff. Check BACKEND_API_BASE_URL." },
      { status: 502 },
    );
  }
}
