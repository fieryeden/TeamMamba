import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create demo user
  const passwordHash = await hashPassword("password123");
  const user = await prisma.user.upsert({
    where: { email: "demo@teammamba.io" },
    update: {},
    create: {
      email: "demo@teammamba.io",
      passwordHash,
      firstName: "Demo",
      lastName: "User",
      role: "ADMIN",
    },
  });

  console.log(`✅ Created user: ${user.email}`);

  // Create workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "Product Team",
      description: "Main product development workspace",
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  console.log(`✅ Created workspace: ${workspace.name}`);

  // Create a board
  const board = await prisma.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Sprint Board",
      description: "Current sprint tracking",
      boardKind: "KANBAN",
      members: { create: { userId: user.id, role: "OWNER" } },
      columns: {
        createMany: {
          data: [
            { title: "Status", columnType: "STATUS", order: 0, config: { labels: ["Not Started", "Working on it", "Done", "Stuck"], colors: ["#c4c4c4", "#fdab3d", "#00c875", "#e2445c"] } },
            { title: "People", columnType: "PEOPLE", order: 1, config: {} },
            { title: "Due Date", columnType: "DATE", order: 2, config: {} },
            { title: "Priority", columnType: "STATUS", order: 3, config: { labels: ["Critical", "High", "Medium", "Low"], colors: ["#333333", "#e2445c", "#fdab3d", "#579bfc"] } },
            { title: "Progress", columnType: "PROGRESS", order: 4, config: {} },
          ],
        },
      },
      groups: {
        createMany: {
          data: [
            { name: "Sprint 1", color: "#579bfc", position: 0 },
            { name: "Sprint 2", color: "#fdab3d", position: 1 },
            { name: "Backlog", color: "#a25ddc", position: 2 },
          ],
        },
      },
    },
    include: { columns: true, groups: true },
  });

  console.log(`✅ Created board: ${board.name}`);

  // Create items in first group
  const sprint1 = board.groups[0];
  const statusCol = board.columns.find((c) => c.title === "Status")!;
  const dateCol = board.columns.find((c) => c.title === "Due Date")!;
  const priorityCol = board.columns.find((c) => c.title === "Priority")!;
  const progressCol = board.columns.find((c) => c.title === "Progress")!;

  const items = [
    { name: "Design landing page", status: 1, priority: 1, progress: 60, date: "2026-05-15" },
    { name: "Build API endpoints", status: 1, priority: 0, progress: 30, date: "2026-05-18" },
    { name: "Write unit tests", status: 0, priority: 2, progress: 0, date: "2026-05-20" },
    { name: "Deploy to staging", status: 3, priority: 2, progress: 0, date: "2026-05-22" },
    { name: "User authentication flow", status: 2, priority: 1, progress: 100, date: "2026-05-10" },
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const created = await prisma.item.create({
      data: {
        boardId: board.id,
        groupId: sprint1.id,
        name: item.name,
        position: i,
      },
    });

    await prisma.columnValue.createMany({
      data: [
        { itemId: created.id, columnId: statusCol.id, value: item.status },
        { itemId: created.id, columnId: dateCol.id, value: item.date },
        { itemId: created.id, columnId: priorityCol.id, value: item.priority },
        { itemId: created.id, columnId: progressCol.id, value: item.progress },
      ],
    });
  }

  console.log(`✅ Created ${items.length} demo items`);

  // Create a second board (Table view)
  await prisma.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Project Roadmap",
      description: "Long-term project planning",
      boardKind: "TABLE",
      members: { create: { userId: user.id, role: "OWNER" } },
      columns: {
        createMany: {
          data: [
            { title: "Status", columnType: "STATUS", order: 0, config: { labels: ["Planning", "In Progress", "Review", "Complete"], colors: ["#579bfc", "#fdab3d", "#a25ddc", "#00c875"] } },
            { title: "Owner", columnType: "PEOPLE", order: 1, config: {} },
            { title: "Target Date", columnType: "DATE", order: 2, config: {} },
            { title: "Budget", columnType: "NUMBER", order: 3, config: {} },
          ],
        },
      },
      groups: {
        createMany: {
          data: [
            { name: "Q2 2026", color: "#00c875", position: 0 },
            { name: "Q3 2026", color: "#579bfc", position: 1 },
          ],
        },
      },
    },
  });

  console.log("✅ Created Project Roadmap board");

  // Create an automation
  await prisma.automation.create({
    data: {
      boardId: board.id,
      userId: user.id,
      name: "Auto-mark done",
      trigger: "STATUS_CHANGED",
      action: "CHANGE_STATUS",
      actionConfig: { description: "When status changes to Done, move item to completed group" },
    },
  });

  console.log("✅ Created demo automation");
  console.log("🎉 Seeding complete!");
  console.log("📧 Login: demo@teammamba.io");
  console.log("🔑 Password: password123");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
