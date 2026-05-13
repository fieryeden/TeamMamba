import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkspaceClient } from "@/components/boards/workspace-client";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      members: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      },
      boards: {
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace) redirect("/dashboard");

  return <WorkspaceClient workspace={workspace} />;
}
