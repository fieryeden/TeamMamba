import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={user} workspaces={JSON.parse(JSON.stringify(workspaces))} />
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
