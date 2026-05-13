import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkspacesClient } from "@/components/boards/workspaces-client";

export default async function WorkspacesPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true } },
      boards: {
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
      _count: { select: { boards: true, members: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return <WorkspacesClient workspaces={JSON.parse(JSON.stringify(workspaces))} />;
}
