import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AutomationsClient } from "@/components/automations/automations-client";

export default async function AutomationsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const automations = await prisma.automation.findMany({
    where: { userId: user.id },
    include: {
      board: {
        select: {
          id: true,
          name: true,
          workspace: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <AutomationsClient automations={JSON.parse(JSON.stringify(automations))} />;
}
