import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {
    jwt: process.env.JWT_SECRET ? "ok" : "missing",
    database: "unknown",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = checks.jwt === "ok" && checks.database === "ok";

  return NextResponse.json(
    { ok: healthy, checks },
    { status: healthy ? 200 : 503 },
  );
}
