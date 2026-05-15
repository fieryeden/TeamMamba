import { getAuthUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { WorkloadClient } from "@/components/workload/workload-client";

export default async function WorkloadPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return <WorkloadClient />;
}
