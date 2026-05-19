import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
  const dashboards = await prisma.dashboard.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <DashboardShell
      user={user}
      workspaces={JSON.parse(JSON.stringify(workspaces))}
      dashboards={JSON.parse(JSON.stringify(dashboards))}
    >
      {children}
    </DashboardShell>
  );
}
