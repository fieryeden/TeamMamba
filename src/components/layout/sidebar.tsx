"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Zap,
  Bell,
  Users,
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
  className?: string;
  onNavigate?: () => void;
}

export function DashboardSidebar({ user, className, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/workspaces", label: "Workspaces", icon: FolderKanban },
    { href: "/automations", label: "Automations", icon: Zap },
    { href: "/team", label: "Team", icon: Users },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    if (href === "/workspaces") {
      return pathname === "/workspaces" || pathname.startsWith("/workspace/");
    }
    return pathname === href;
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
      </div>
    </aside>
  );
}
