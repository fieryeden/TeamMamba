import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

export default async function WebhooksPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const memberBoards = await prisma.boardMember.findMany({
    where: { userId: user.id },
    include: { board: { select: { id: true, name: true, boardKind: true } } },
  });

  return (
    <WebhooksClient
      boards={memberBoards.map((m) => m.board)}
    />
  );
}
