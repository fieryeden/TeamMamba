import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TeamClient } from "@/components/team/team-client";

export default async function TeamPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspace: { members: { some: { userId: user.id } } } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          avatarUrl: true, role: true, status: true, lastLoginAt: true,
        },
      },
      workspace: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return <TeamClient currentUser={user} members={JSON.parse(JSON.stringify(workspaceMembers))} />;
}
