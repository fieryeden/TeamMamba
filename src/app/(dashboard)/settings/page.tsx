import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      avatarUrl: true, role: true, timezone: true, createdAt: true, themePreference: true,
      emailNotificationsEnabled: true, emailOnMentions: true, emailOnAssignments: true, emailOnDueDates: true,
    },
  });

  if (!fullUser) redirect("/login");

  const apiTokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, lastUsed: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <SettingsClient
      user={JSON.parse(JSON.stringify(fullUser))}
      apiTokens={JSON.parse(JSON.stringify(apiTokens))}
    />
  );
}
