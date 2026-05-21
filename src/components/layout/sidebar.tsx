"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderKanban, Settings, Zap, Bell, Users,
  BarChart3, FileText, Webhook, Activity, Plug,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
  };
  dashboards?: Array<{ id: string; name: string }>;
  workspaces?: Array<{ id: string; name: string; color?: string | null }>;
  className?: string;
  onNavigate?: () => void;
}

export function DashboardSidebar({ user, dashboards = [], workspaces = [], className, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/insights", label: "Insights", icon: BarChart3 },
    { href: "/workspaces", label: "Workspaces", icon: FolderKanban },
    { href: "/workload", label: "Workload", icon: Users },
    { href: "/docs", label: "Docs", icon: FileText },
    { href: "/automations", label: "Automations", icon: Zap },
    { href: "/activities", label: "Activity", icon: Activity },
    { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/integrations", label: "Integrations", icon: Plug },
    { href: "/team", label: "Team", icon: Users },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    if (href === "/workspaces") {
      return pathname === "/workspaces" || pathname.startsWith("/workspace/");
    }
    if (href === "/insights") return pathname === "/insights" || pathname.startsWith("/insights/");
    if (href === "/docs") return pathname === "/docs" || pathname.startsWith("/docs/");
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className={cn("flex w-64 flex-col border-r bg-card", className)}>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mamba-600 text-white font-bold text-sm">
          TM
        </div>
        <span className="text-lg font-bold">TeamMamba</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-mamba-50 text-mamba-700 dark:bg-mamba-900/20 dark:text-mamba-400"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}

        {dashboards.length > 0 && (
          <div className="mt-5 space-y-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dashboards
            </p>
            {dashboards.slice(0, 8).map((dashboard) => (
              <Link
                key={dashboard.id}
                href={`/insights?dashboard=${dashboard.id}`}
                onClick={onNavigate}
                className={cn(
                  "block truncate rounded-lg px-3 py-1.5 text-xs transition-colors",
                  pathname === "/insights"
                    ? "text-foreground hover:bg-accent"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={dashboard.name}
              >
                {dashboard.name}
              </Link>
            ))}
          </div>
        )}

        {workspaces.length > 0 && (
          <div className="mt-5 space-y-1 max-h-48 overflow-y-auto">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workspaces
            </p>
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/workspace/${workspace.id}`}
                onClick={onNavigate}
                className={cn(
                  "block truncate rounded-lg border-l-4 px-3 py-1.5 text-xs transition-colors",
                  pathname === `/workspace/${workspace.id}`
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                style={{ borderLeftColor: workspace.color ?? "#579bfc" }}
                title={workspace.name}
              >
                {workspace.name}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mamba-100 text-mamba-700 text-xs font-bold">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
