import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export default async function NotificationsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <NotificationsClient notifications={JSON.parse(JSON.stringify(notifications))} />;
}
