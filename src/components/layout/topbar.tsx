"use client";

import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  user: {
    firstName: string;
    lastName: string;
  };
}

export function TopBar({ user }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search boards, items, people..."
            className="pl-9 bg-muted/50 border-0"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-mamba-500 text-[8px] font-bold text-white flex items-center justify-center">
            3
          </span>
        </Button>
        <Button size="sm" className="bg-mamba-600 hover:bg-mamba-700">
          <Plus className="mr-1 h-4 w-4" />
          New Board
        </Button>
      </div>
    </header>
  );
}
