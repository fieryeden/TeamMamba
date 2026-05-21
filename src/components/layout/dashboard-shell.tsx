"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { LayoutDashboard, FolderKanban, Zap, Bell, Settings } from "lucide-react";
import { DashboardSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

export function DashboardShell({
  user,
  workspaces,
  dashboards,
  children,
}: {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
  };
  workspaces: Array<{ id: string; name: string; color?: string | null }>;
  dashboards: Array<{ id: string; name: string }>;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [localWorkspaces, setLocalWorkspaces] = useState(workspaces);

  // Sync with prop changes (e.g. full page navigation)
  useEffect(() => { setLocalWorkspaces(workspaces); }, [workspaces]);

  // Listen for real-time workspace color changes from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const { workspaceId, color } = (e as CustomEvent).detail;
      setLocalWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, color } : w))
      );
    };
    window.addEventListener("workspace-color-change", handler);
    return () => window.removeEventListener("workspace-color-change", handler);
  }, []);

  const mobileNav = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/workspaces", label: "Boards", icon: FolderKanban },
    { href: "/automations", label: "Auto", icon: Zap },
    { href: "/notifications", label: "Alerts", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar user={user} dashboards={dashboards} workspaces={localWorkspaces} className="hidden md:flex" />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <DashboardSidebar
          user={user}
          dashboards={dashboards}
          workspaces={localWorkspaces}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          user={user}
          workspaces={localWorkspaces}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-auto bg-muted/30 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t bg-card md:hidden">
        {mobileNav.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="flex flex-col items-center justify-center gap-1 py-2 text-[10px] text-muted-foreground"
          >
            <entry.icon className="h-4 w-4" />
            {entry.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
