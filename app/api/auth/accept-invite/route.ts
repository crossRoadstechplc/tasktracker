import { NextResponse } from "next/server";

/** Tracker-local invites are retired; use workforce employee invites. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Tracker-local invites are retired. Accept workforce invites from the admin portal or employee onboarding flow.",
    },
    { status: 410 },
  );
}
