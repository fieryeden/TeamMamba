import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { IntegrationsClient } from "@/components/integrations/integrations-client";

export default async function IntegrationsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return <IntegrationsClient />;
}
