import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthSession } from "@/src/lib/auth/session";
import { prisma } from "@/src/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/src/lib/workspace/roles";

const removeSchema = z.object({
  displayName: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
});

function canManageStaff(role: string): boolean {
  return role === "Super Admin" || role === "Admin";
}

export async function DELETE(request: Request) {
  const { auth } = await resolveAuthSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canManageStaff(auth.staffMember.permissionRole)) {
    return NextResponse.json(
      { error: "Only Admins can remove team members." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "displayName is required." }, { status: 400 });
  }

  const displayName = parsed.data.displayName.trim();
  const email = parsed.data.email?.trim().toLowerCase();

  if (displayName === auth.staffMember.displayName) {
    return NextResponse.json(
      { error: "You cannot remove your own account while signed in." },
      { status: 400 },
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const staffMember = await prisma.staffMember.findUnique({
    where: {
      workspaceId_displayName: {
        workspaceId: workspace.id,
        displayName,
      },
    },
  });

  const userId = staffMember?.userId ?? null;

  await prisma.$transaction(async (tx) => {
    if (staffMember) {
      await tx.staffMember.delete({ where: { id: staffMember.id } });
    }

    if (userId) {
      await tx.user.delete({ where: { id: userId } });
      return;
    }

    if (email) {
      await tx.user.deleteMany({
        where: {
          email,
          staffMember: null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, removed: Boolean(staffMember || email) });
}
