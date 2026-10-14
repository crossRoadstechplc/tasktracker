import { NextResponse } from "next/server";

/** Tracker invites are retired — people come from Workforce. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Inviting from Task Operations is disabled. Add people in Workforce; they appear here automatically.",
      code: "TRACKER_INVITE_RETIRED"
    },
    { status: 410 }
  );
}
