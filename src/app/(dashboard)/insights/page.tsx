import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InsightsClient } from "@/components/insights/insights-client";

export default async function InsightsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const dashboards = await prisma.dashboard.findMany({
    where: { ownerId: user.id },
    include: { widgets: { orderBy: { order: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  const boards = await prisma.boardMember.findMany({
    where: { userId: user.id },
    include: {
      board: {
        select: { id: true, name: true, columns: { select: { id: true, title: true, columnType: true } } },
      },
    },
  });

  return (
    <InsightsClient
      user={user}
      dashboards={dashboards.map((d) => ({
        ...d,
        widgets: d.widgets.map((w) => ({
          ...w,
          config: (w.config ?? null) as Record<string, unknown> | null,
        })),
      }))}
      boards={boards.map((b) => b.board)}
    />
  );
}
