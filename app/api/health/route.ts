import { NextResponse } from "next/server";
import { backendFetch } from "@/src/lib/api/backend";

export async function GET() {
  try {
    const response = await backendFetch("/health");
    const data = await response.json().catch(() => ({ status: "unknown" }));
    return NextResponse.json(
      {
        status: response.ok ? "ok" : "degraded",
        backend: data,
      },
      { status: response.ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      { status: "error", error: "Backend unreachable" },
      { status: 503 },
    );
  }
}
