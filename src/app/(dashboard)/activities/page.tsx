import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActivitiesClient } from "@/components/activities/activities-client";

const INITIAL_TAKE = 30;

export default async function ActivitiesPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [activities, memberships] = await Promise.all([
    prisma.activity.findMany({
      where: {
        board: {
          members: { some: { userId: user.id } },
        },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        board: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: INITIAL_TAKE,
    }),
    prisma.boardMember.findMany({
      where: { userId: user.id },
      include: { board: { select: { id: true, name: true } } },
      orderBy: { board: { name: "asc" } },
    }),
  ]);

  return (
    <ActivitiesClient
      initialActivities={JSON.parse(JSON.stringify(activities))}
      boards={memberships.map((entry) => entry.board)}
      initialTake={INITIAL_TAKE}
    />
  );
}
