import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocsClient } from "@/components/docs/docs-client";

export default async function DocsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: {
      workspace: {
        select: { id: true, name: true },
      },
    },
  });

  return <DocsClient workspaces={workspaces.map((w) => w.workspace)} />;
}
