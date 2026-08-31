import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { publishWorkspaceEvent, bumpWorkspaceRevision } from "../src/lib/realtime/notify";

/** Real production staff emails — never delete these users or staff records. */
const PROTECTED_EMAILS = new Set([
  "dawit.ttamiru@gmail.com",
  "dawit2tamiru@gmail.com",
  "samuelmulu810@gmail.com",
  "tariqbagersh@gmail.com",
  "y.k.berhanu@gmail.com",
]);

/** E2E / seed test accounts created by automated tests. */
const TEST_EMAIL_PATTERNS = [
  /^e2e-.*@tracker\.local$/i,
];

function isTestEmail(email: string): boolean {
  return TEST_EMAIL_PATTERNS.some((pattern) => pattern.test(email));
}

function isE2eTitle(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().startsWith("e2e-");
}

function payloadHasE2eTitle(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return isE2eTitle(record.title) || isE2eTitle(record.name);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const workspace = await prisma.workspace.findUnique({ where: { slug: "default" } });
  if (!workspace) throw new Error("Default workspace not found.");

  console.log(dryRun ? "DRY RUN — no changes will be made.\n" : "Cleaning test data...\n");

  const users = await prisma.user.findMany({ include: { staffMember: true } });
  const testUsers = users.filter((u) => isTestEmail(u.email) && !PROTECTED_EMAILS.has(u.email));

  const testTasks = await prisma.task.findMany({
    where: {
      workspaceId: workspace.id,
      title: { startsWith: "e2e-", mode: "insensitive" },
    },
  });
  const testScheduleEvents = await prisma.scheduleEvent.findMany({
    where: {
      workspaceId: workspace.id,
      title: { startsWith: "e2e-", mode: "insensitive" },
    },
  });
  const allDeletedTasks = await prisma.deletedTask.findMany({
    where: { workspaceId: workspace.id },
  });
  const allArchivedTasks = await prisma.archivedTask.findMany({
    where: { workspaceId: workspace.id },
  });
  const testArchivedTasks = allArchivedTasks.filter((row) => payloadHasE2eTitle(row.payload));
  const testProjects = await prisma.project.findMany({
    where: {
      workspaceId: workspace.id,
      name: { startsWith: "e2e-", mode: "insensitive" },
    },
    include: {
      tasks: { select: { id: true, title: true } },
      events: { select: { id: true, title: true } },
    },
  });
  const projectTaskIds = testProjects.flatMap((project) => project.tasks.map((task) => task.id));
  const projectScheduleIds = testProjects.flatMap((project) => project.events.map((event) => event.id));
  const testOrgTeams = await prisma.orgTeam.findMany({
    where: {
      workspaceId: workspace.id,
      name: { startsWith: "e2e-", mode: "insensitive" },
    },
  });
  const testStaff = await prisma.staffMember.findMany({
    where: {
      workspaceId: workspace.id,
      displayName: { startsWith: "E2E ", mode: "insensitive" },
      NOT: {
        user: { email: { in: [...PROTECTED_EMAILS] } },
      },
    },
    include: { user: { select: { email: true } } },
  });

  const removableStaff = testStaff.filter(
    (s) => !s.user?.email || !PROTECTED_EMAILS.has(s.user.email),
  );
  const removableStaffIds = removableStaff.map((s) => s.id);

  const testNotifications = await prisma.notification.findMany({
    where: {
      workspaceId: workspace.id,
      OR: [
        { recipientId: { in: removableStaffIds } },
        { actorStaffId: { in: removableStaffIds } },
        { title: { startsWith: "e2e-", mode: "insensitive" } },
      ],
    },
  });

  console.log("Will remove:");
  console.log("  Users:", testUsers.map((u) => u.email).join(", ") || "(none)");
  console.log("  Staff:", removableStaff.map((s) => s.displayName).join(", ") || "(none)");
  console.log(
    "  Tasks:",
    testTasks.length,
    testTasks.map((t) => t.title).join(", ") || "(none)",
  );
  console.log(
    "  Schedule events:",
    testScheduleEvents.length,
    testScheduleEvents.map((s) => s.title).join(", ") || "(none)",
  );
  console.log("  Deleted tasks:", allDeletedTasks.length);
  if (allDeletedTasks.length > 0) {
    console.log(
      "    titles:",
      allDeletedTasks
        .map((row) => {
          const payload = row.payload as Record<string, unknown>;
          return String(payload?.title ?? payload?.name ?? row.trashId);
        })
        .join(", "),
    );
  }
  console.log("  Archived tasks:", testArchivedTasks.length);
  console.log("  Test projects:", testProjects.map((p) => p.name).join(", ") || "(none)");
  if (testProjects.length > 0) {
    console.log(
      "    with tasks:",
      testProjects
        .map((p) => `${p.name} (${p.tasks.map((t) => t.title).join(", ") || "empty"})`)
        .join("; "),
    );
  }
  console.log("  Test org teams:", testOrgTeams.map((t) => t.name).join(", ") || "(none)");
  console.log("  Notifications:", testNotifications.length);

  if (dryRun) return;

  await prisma.$transaction(
    async (tx) => {
    const testTaskIds = [...new Set([...testTasks.map((t) => t.id), ...projectTaskIds])];
    if (testTaskIds.length > 0) {
      await tx.taskUpdate.deleteMany({ where: { taskId: { in: testTaskIds } } });
      await tx.taskOwner.deleteMany({ where: { taskId: { in: testTaskIds } } });
      await tx.task.deleteMany({ where: { id: { in: testTaskIds } } });
    }

    if (allDeletedTasks.length > 0) {
      await tx.deletedTask.deleteMany({ where: { workspaceId: workspace.id } });
    }

    if (testArchivedTasks.length > 0) {
      await tx.archivedTask.deleteMany({
        where: { archivedId: { in: testArchivedTasks.map((row) => row.archivedId) } },
      });
    }

    const testScheduleIds = [
      ...new Set([...testScheduleEvents.map((event) => event.id), ...projectScheduleIds]),
    ];
    if (testScheduleIds.length > 0) {
      await tx.scheduleEventGuest.deleteMany({
        where: { eventId: { in: testScheduleIds } },
      });
      await tx.scheduleEvent.deleteMany({ where: { id: { in: testScheduleIds } } });
    }

    if (testNotifications.length > 0) {
      await tx.notification.deleteMany({
        where: { id: { in: testNotifications.map((n) => n.id) } },
      });
    }

    for (const orgTeam of testOrgTeams) {
      await tx.orgTeamMember.deleteMany({ where: { orgTeamId: orgTeam.id } });
      await tx.orgTeam.delete({ where: { id: orgTeam.id } });
    }

    for (const project of testProjects) {
      await tx.projectMember.deleteMany({ where: { projectId: project.id } });
      await tx.project.delete({ where: { id: project.id } });
    }

    for (const member of removableStaff) {
      await tx.notification.deleteMany({
        where: {
          OR: [{ recipientId: member.id }, { actorStaffId: member.id }],
        },
      });
      await tx.taskOwner.deleteMany({ where: { staffMemberId: member.id } });
      await tx.taskUpdate.deleteMany({ where: { staffMemberId: member.id } });
      await tx.projectMember.deleteMany({ where: { staffMemberId: member.id } });
      await tx.orgTeamMember.deleteMany({ where: { staffMemberId: member.id } });
      await tx.scheduleEventGuest.deleteMany({ where: { staffMemberId: member.id } });
      await tx.staffMember.delete({ where: { id: member.id } });
    }

    for (const user of testUsers) {
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    }
    },
    { maxWait: 15000, timeout: 60000 },
  );

  const revision = await bumpWorkspaceRevision(workspace.id);
  await publishWorkspaceEvent({
    type: "workspace.reload",
    workspaceId: workspace.id,
    actorUserId: null,
    actorClientId: null,
    resource: "workspace",
    resourceId: null,
    payload: { reason: "test-data-cleanup" },
  });

  console.log("\nCleanup complete. Workspace revision:", revision);
  console.log("Protected users preserved:", [...PROTECTED_EMAILS].join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
