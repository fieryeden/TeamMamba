import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      boards: {
        include: {
          _count: { select: { items: true } },
          columns: { take: 0 },
        },
        orderBy: { updatedAt: "desc" },
      },
      _count: { select: { members: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const recentActivities = await prisma.activity.findMany({
    where: {
      board: { members: { some: { userId: user.id } } },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      board: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <DashboardClient
      user={user}
      workspaces={JSON.parse(JSON.stringify(workspaces))}
      recentActivities={JSON.parse(JSON.stringify(recentActivities))}
    />
  );
}
