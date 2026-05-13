import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoardClient } from "@/components/boards/board-client";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      workspace: { select: { id: true, name: true } },
      columns: { orderBy: { order: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: {
              columnValues: { include: { column: true } },
              assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
              comments: {
                orderBy: { createdAt: "desc" },
                take: 10,
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
                },
              },
              updates: {
                orderBy: { createdAt: "desc" },
                take: 10,
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
                },
              },
              activities: {
                orderBy: { createdAt: "desc" },
                take: 10,
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
                },
              },
              _count: { select: { comments: true, subitems: true } },
            },
          },
        },
      },
      members: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      },
      automations: { where: { isEnabled: true } },
    },
  });

  if (!board) redirect("/dashboard");

  return <BoardClient user={user} board={board} />;
}
