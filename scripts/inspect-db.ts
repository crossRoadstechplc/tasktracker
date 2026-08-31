import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "default" } });
  console.log("workspace:", workspace?.id ?? "NOT FOUND");
  if (!workspace) return;

  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    include: { staffMember: { select: { displayName: true } } },
  });
  console.log("\nUSERS (" + users.length + ")");
  for (const u of users) {
    console.log(" ", u.email, "->", u.staffMember?.displayName ?? "(no staff)");
  }

  const staff = await prisma.staffMember.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { sortOrder: "asc" },
    include: { user: { select: { email: true } } },
  });
  console.log("\nSTAFF (" + staff.length + ")");
  for (const s of staff) {
    console.log(" ", s.displayName, "|", s.user?.email ?? "no user");
  }

  const tasks = await prisma.task.findMany({
    where: { workspaceId: workspace.id },
    include: {
      project: { select: { name: true } },
      owners: { include: { staffMember: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nTASKS (" + tasks.length + ")");
  for (const t of tasks) {
    console.log(
      " ",
      t.id.slice(0, 8),
      "|",
      t.title,
      "|",
      t.status,
      "|",
      t.project.name,
      "|",
      t.owners.map((o) => o.staffMember.displayName).join(", ") || "(none)",
      "|",
      t.createdAt.toISOString(),
    );
  }

  const schedule = await prisma.scheduleEvent.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, title: true },
  });
  console.log("\nSCHEDULE (" + schedule.length + ")");
  for (const s of schedule) console.log(" ", s.title);

  const deleted = await prisma.deletedTask.count({ where: { workspaceId: workspace.id } });
  const archived = await prisma.archivedTask.count({ where: { workspaceId: workspace.id } });
  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { name: true },
  });
  const orgTeams = await prisma.orgTeam.findMany({
    where: { workspaceId: workspace.id },
    select: { name: true },
  });
  console.log("\nDeleted:", deleted, "Archived:", archived);
  console.log("Projects:", projects.map((p) => p.name).join(", "));
  console.log("Org teams:", orgTeams.map((t) => t.name).join(", "));
}

main()
  .catch((error) => {
    console.error("ERROR", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
