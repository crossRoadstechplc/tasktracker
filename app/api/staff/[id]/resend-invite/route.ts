import { NextResponse } from "next/server";

/** Invite resend is handled by workforce invites; tracker-local invites are retired. */
export async function POST() {
  return NextResponse.json(
    { error: "Use workforce employee invites. Tracker-local invite resend is not available." },
    { status: 410 },
  );
}
