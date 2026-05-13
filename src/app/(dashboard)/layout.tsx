import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { DashboardSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={user} />
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
