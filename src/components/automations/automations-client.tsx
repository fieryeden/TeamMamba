"use client";

import { useState } from "react";
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";

interface Automation {
  id: string; name: string; trigger: string; action: string;
  conditions: unknown; actionConfig: unknown; isEnabled: boolean;
  lastFiredAt: string | null; createdAt: string;
  board: { id: string; name: string; workspace: { id: string; name: string } };
}

const triggerLabels: Record<string, string> = {
  STATUS_CHANGED: "When status changes",
  DATE_ARRIVES: "When date arrives",
  ITEM_CREATED: "When item is created",
  ITEM_MOVED_TO_GROUP: "When item moves to group",
  PRIORITY_CHANGED: "When priority changes",
  ASSIGNEE_CHANGED: "When assignee changes",
  COLUMN_VALUE_CHANGED: "When column value changes",
  RECURRING_SCHEDULE: "On a schedule",
};

const actionLabels: Record<string, string> = {
  CHANGE_STATUS: "Change status",
  MOVE_ITEM_TO_GROUP: "Move to group",
  NOTIFY_ASSIGNEE: "Notify assignee",
  NOTIFY_USER: "Notify user",
  SET_COLUMN_VALUE: "Set column value",
  CREATE_ITEM: "Create item",
  SEND_EMAIL: "Send email",
  ASSIGN_USER: "Assign user",
  SHIFT_DATE: "Shift date",
};

export function AutomationsClient({ automations: initial }: { automations: Automation[] }) {
  const [automations, setAutomations] = useState(initial);

  const toggleAutomation = async (id: string, enabled: boolean) => {
    await fetch(`/api/automations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isEnabled: !enabled }),
    });
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isEnabled: !enabled } : a))
    );
  };

  const deleteAutomation = async (id: string) => {
    await fetch(`/api/automations`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" /> Automations
          </h1>
          <p className="text-muted-foreground text-sm">Automate your workflow with custom rules</p>
        </div>
      </div>

      {automations.length > 0 ? (
        <div className="space-y-3">
          {automations.map((auto) => (
            <Card key={auto.id} className={auto.isEnabled ? "" : "opacity-60"}>
              <CardContent className="flex items-center gap-4 py-3 px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{auto.name}</span>
                    {auto.isEnabled ? (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {triggerLabels[auto.trigger] || auto.trigger} → {actionLabels[auto.action] || auto.action}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Board: {auto.board.name} ({auto.board.workspace.name})
                    {auto.lastFiredAt && ` • Last fired ${formatDate(auto.lastFiredAt)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleAutomation(auto.id, auto.isEnabled)}
                >
                  {auto.isEnabled ? (
                    <ToggleRight className="h-5 w-5 text-green-600" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteAutomation(auto.id)}>
                      <Trash2 className="h-3 w-3 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <h3 className="font-semibold mb-1">No automations yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Automations run automatically when triggered, saving you time and keeping your boards in sync.
            </p>
            <p className="text-xs text-muted-foreground">
              Create automations from any board by clicking the ⚡ Automate button.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
