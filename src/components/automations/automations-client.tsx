"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2, MoreHorizontal, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";

interface Automation {
  id: string;
  boardId?: string;
  name: string;
  trigger: string;
  action: string;
  conditions: unknown;
  actionConfig: unknown;
  isEnabled: boolean;
  lastFiredAt: string | null;
  createdAt: string;
  board: { id: string; name: string; workspace: { id: string; name: string } };
}

interface BoardOption {
  id: string;
  name: string;
  workspace: { id: string; name: string };
  columns: Array<{ id: string; title: string; columnType: string }>;
  groups: Array<{ id: string; name: string }>;
}

const triggerOptions = [
  { value: "STATUS_CHANGED", label: "When status changes" },
  { value: "DATE_ARRIVES", label: "When date arrives" },
  { value: "ITEM_CREATED", label: "When item is created" },
  { value: "ITEM_MOVED_TO_GROUP", label: "When item moves to group" },
  { value: "PRIORITY_CHANGED", label: "When priority changes" },
  { value: "ASSIGNEE_CHANGED", label: "When assignee changes" },
  { value: "COLUMN_VALUE_CHANGED", label: "When any column value changes" },
  { value: "RECURRING_SCHEDULE", label: "On a recurring schedule" },
];

const actionOptions = [
  { value: "CHANGE_STATUS", label: "Change status" },
  { value: "MOVE_ITEM_TO_GROUP", label: "Move item to group" },
  { value: "NOTIFY_ASSIGNEE", label: "Notify assignee" },
  { value: "NOTIFY_USER", label: "Notify user" },
  { value: "SET_COLUMN_VALUE", label: "Set column value" },
  { value: "CREATE_ITEM", label: "Create item" },
  { value: "SEND_EMAIL", label: "Send email" },
  { value: "ASSIGN_USER", label: "Assign user" },
  { value: "SHIFT_DATE", label: "Shift date" },
];

const triggerLabels = Object.fromEntries(triggerOptions.map((entry) => [entry.value, entry.label]));
const actionLabels = Object.fromEntries(actionOptions.map((entry) => [entry.value, entry.label]));

type KeyValueRow = { id: string; key: string; value: string };

const makeRow = (key = "", value = ""): KeyValueRow => ({
  id: crypto.randomUUID(),
  key,
  value,
});

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseMaybeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (!Number.isNaN(Number(trimmed)) && /^[-+]?\d*\.?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function AutomationsClient({ automations: initial }: { automations: Automation[] }) {
  const [automations, setAutomations] = useState(initial);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [boardId, setBoardId] = useState("");
  const [trigger, setTrigger] = useState("STATUS_CHANGED");
  const [action, setAction] = useState("CHANGE_STATUS");

  const [conditions, setConditions] = useState<KeyValueRow[]>([makeRow()]);
  const [actionConfigRows, setActionConfigRows] = useState<KeyValueRow[]>([makeRow()]);

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === boardId),
    [boardId, boards]
  );

  useEffect(() => {
    if (!dialogOpen || boards.length > 0) return;

    let mounted = true;
    setLoadingBoards(true);
    fetch("/api/boards")
      .then((res) => res.json())
      .then((json) => {
        if (!mounted) return;
        setBoards((json.boards ?? []) as BoardOption[]);
      })
      .finally(() => {
        if (mounted) setLoadingBoards(false);
      });

    return () => {
      mounted = false;
    };
  }, [dialogOpen, boards.length]);

  useEffect(() => {
    if (!dialogOpen || boardId || boards.length === 0) return;
    setBoardId(boards[0].id);
  }, [dialogOpen, boardId, boards]);

  const resetDialog = () => {
    setIsEditing(false);
    setEditingId(null);
    setStep(1);
    setName("");
    setBoardId(boards[0]?.id ?? "");
    setTrigger("STATUS_CHANGED");
    setAction("CHANGE_STATUS");
    setConditions([makeRow()]);
    setActionConfigRows([makeRow()]);
  };

  const openCreateDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const openEditDialog = (automation: Automation) => {
    setDialogOpen(true);
    setIsEditing(true);
    setEditingId(automation.id);
    setStep(1);
    setName(automation.name);
    setBoardId(automation.board.id);
    setTrigger(automation.trigger);
    setAction(automation.action);

    const condObj = (automation.conditions as Record<string, unknown> | null) ?? {};
    const nextConditions = Object.entries(condObj).map(([key, value]) => makeRow(key, formatFieldValue(value)));
    setConditions(nextConditions.length > 0 ? nextConditions : [makeRow()]);

    const configObj = (automation.actionConfig as Record<string, unknown> | null) ?? {};
    const nextConfig = Object.entries(configObj).map(([key, value]) => makeRow(key, formatFieldValue(value)));
    setActionConfigRows(nextConfig.length > 0 ? nextConfig : [makeRow()]);
  };

  const toObject = (rows: KeyValueRow[]) => {
    const entries = rows
      .filter((row) => row.key.trim().length > 0)
      .map((row) => {
        const key = row.key.trim();
        if (key === "userIds") {
          const values = row.value
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          return [key, values] as const;
        }
        return [key, parseMaybeJson(row.value)] as const;
      });
    return Object.fromEntries(entries);
  };

  const submitAutomation = async () => {
    if (!name.trim() || !boardId) return;

    const payload = {
      ...(isEditing ? { id: editingId } : {}),
      boardId,
      name: name.trim(),
      trigger,
      action,
      conditions: toObject(conditions),
      actionConfig: toObject(actionConfigRows),
    };

    const res = await fetch("/api/automations", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return;
    const json = await res.json();
    const updated = json.automation as Automation & { boardId: string };
    const updatedBoardId = updated.boardId || boardId;
    const matchedBoard = boards.find((board) => board.id === updatedBoardId);

    if (isEditing) {
      setAutomations((prev) =>
        prev.map((entry) =>
          entry.id === updated.id
            ? {
                ...entry,
                ...updated,
                board: matchedBoard
                  ? {
                      id: updatedBoardId,
                      name: matchedBoard.name,
                      workspace: matchedBoard.workspace,
                    }
                  : entry.board,
              }
            : entry
        )
      );
    } else {
      setAutomations((prev) => [
        {
          ...updated,
          board: matchedBoard
            ? { id: matchedBoard.id, name: matchedBoard.name, workspace: matchedBoard.workspace }
            : { id: boardId, name: "Board", workspace: { id: "", name: "Workspace" } },
        },
        ...prev,
      ]);
    }

    setDialogOpen(false);
    resetDialog();
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    await fetch(`/api/automations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isEnabled: !enabled }),
    });
    setAutomations((prev) => prev.map((entry) => (entry.id === id ? { ...entry, isEnabled: !enabled } : entry)));
  };

  const deleteAutomation = async (id: string) => {
    await fetch(`/api/automations`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAutomations((prev) => prev.filter((entry) => entry.id !== id));
  };

  const renderActionPresets = () => {
    const columnOptions = selectedBoard?.columns ?? [];
    const statusColumns = columnOptions.filter((column) => column.columnType === "STATUS");
    const dateColumns = columnOptions.filter((column) => column.columnType === "DATE");

    const setField = (key: string, value: string) => {
      setActionConfigRows((prev) => {
        const existing = prev.find((row) => row.key === key);
        if (!existing) return [...prev.filter((row) => row.key.trim()), makeRow(key, value)];
        return prev.map((row) => (row.key === key ? { ...row, value } : row));
      });
    };

    const getField = (key: string) => actionConfigRows.find((row) => row.key === key)?.value ?? "";

    if (action === "CHANGE_STATUS") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={getField("targetColumnId") || "none"} onValueChange={(value) => setField("targetColumnId", value === "none" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Status column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select status column</SelectItem>
              {statusColumns.map((column) => (
                <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder='Target value (e.g. 2 or {"index":2,"label":"Done"})'
            value={getField("targetValue")}
            onChange={(event) => setField("targetValue", event.target.value)}
          />
        </div>
      );
    }

    if (action === "MOVE_ITEM_TO_GROUP") {
      return (
        <Select value={getField("targetGroupId") || "none"} onValueChange={(value) => setField("targetGroupId", value === "none" ? "" : value)}>
          <SelectTrigger>
            <SelectValue placeholder="Target group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select group</SelectItem>
            {(selectedBoard?.groups ?? []).map((group) => (
              <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (action === "SET_COLUMN_VALUE") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={getField("columnId") || "none"} onValueChange={(value) => setField("columnId", value === "none" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select column</SelectItem>
              {columnOptions.map((column) => (
                <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Value"
            value={getField("value")}
            onChange={(event) => setField("value", event.target.value)}
          />
        </div>
      );
    }

    if (action === "SHIFT_DATE") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={getField("columnId") || "none"} onValueChange={(value) => setField("columnId", value === "none" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Date column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select date column</SelectItem>
              {dateColumns.map((column) => (
                <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Days"
            value={getField("days")}
            onChange={(event) => setField("days", event.target.value)}
          />
        </div>
      );
    }

    if (action === "CREATE_ITEM") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={getField("groupId") || "none"} onValueChange={(value) => setField("groupId", value === "none" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use current item group</SelectItem>
              {(selectedBoard?.groups ?? []).map((group) => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="New item name"
            value={getField("itemName")}
            onChange={(event) => setField("itemName", event.target.value)}
          />
        </div>
      );
    }

    if (action === "SEND_EMAIL") {
      return (
        <div className="space-y-3">
          <Input placeholder="To" value={getField("to")} onChange={(event) => setField("to", event.target.value)} />
          <Input placeholder="Subject" value={getField("subject")} onChange={(event) => setField("subject", event.target.value)} />
          <Input placeholder="Body" value={getField("body")} onChange={(event) => setField("body", event.target.value)} />
        </div>
      );
    }

    if (action === "NOTIFY_USER") {
      return (
        <div className="space-y-3">
          <Input placeholder="User ID" value={getField("userId")} onChange={(event) => setField("userId", event.target.value)} />
          <Input placeholder="Notification title" value={getField("title")} onChange={(event) => setField("title", event.target.value)} />
          <Input placeholder="Notification body" value={getField("body")} onChange={(event) => setField("body", event.target.value)} />
        </div>
      );
    }

    if (action === "ASSIGN_USER") {
      return (
        <Input
          placeholder="User IDs (comma separated)"
          value={getField("userIds")}
          onChange={(event) => setField("userIds", event.target.value)}
        />
      );
    }

    if (action === "NOTIFY_ASSIGNEE") {
      return (
        <div className="space-y-3">
          <Input placeholder="Notification title" value={getField("title")} onChange={(event) => setField("title", event.target.value)} />
          <Input placeholder="Notification body" value={getField("body")} onChange={(event) => setField("body", event.target.value)} />
        </div>
      );
    }

    return null;
  };

  const canGoNext =
    (step === 1 && name.trim().length > 0 && boardId) ||
    step === 2 ||
    step === 3 ||
    step === 4;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" /> Automations
          </h1>
          <p className="text-muted-foreground text-sm">Automate your workflow with custom rules</p>
        </div>
        <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" /> Create Automation
        </Button>
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
                    {(triggerLabels[auto.trigger] as string) || auto.trigger} → {(actionLabels[auto.action] as string) || auto.action}
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
                    <DropdownMenuItem onClick={() => openEditDialog(auto)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
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
            <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={openCreateDialog}>
              <Plus className="mr-1 h-4 w-4" /> Create Automation
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Automation" : "Create Automation"}</DialogTitle>
            <DialogDescription>
              Step {step} of 4: {
                step === 1 ? "Trigger + board" :
                step === 2 ? "Conditions" :
                step === 3 ? "Action" :
                "Action config"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {step === 1 && (
              <div className="space-y-3">
                <Input placeholder="Automation name" value={name} onChange={(event) => setName(event.target.value)} />
                <Select value={boardId} onValueChange={setBoardId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingBoards ? "Loading boards..." : "Select board"} />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name} ({board.workspace.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trigger" />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerOptions.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Add optional conditions as key-value pairs (example key: <code>groupId</code> or <code>column.&lt;columnId&gt;</code>).
                </p>
                {conditions.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      placeholder="Condition key"
                      value={row.key}
                      onChange={(event) => setConditions((prev) => prev.map((entry) => entry.id === row.id ? { ...entry, key: event.target.value } : entry))}
                    />
                    <Input
                      placeholder="Condition value"
                      value={row.value}
                      onChange={(event) => setConditions((prev) => prev.map((entry) => entry.id === row.id ? { ...entry, value: event.target.value } : entry))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConditions((prev) => prev.length === 1 ? [makeRow()] : prev.filter((entry) => entry.id !== row.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setConditions((prev) => [...prev, makeRow()])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
                </Button>
              </div>
            )}

            {step === 3 && (
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {renderActionPresets()}
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">Additional action config key-value pairs</p>
                  {actionConfigRows.map((row) => (
                    <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        placeholder="Config key"
                        value={row.key}
                        onChange={(event) => setActionConfigRows((prev) => prev.map((entry) => entry.id === row.id ? { ...entry, key: event.target.value } : entry))}
                      />
                      <Input
                        placeholder="Config value"
                        value={row.value}
                        onChange={(event) => setActionConfigRows((prev) => prev.map((entry) => entry.id === row.id ? { ...entry, value: event.target.value } : entry))}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActionConfigRows((prev) => prev.length === 1 ? [makeRow()] : prev.filter((entry) => entry.id !== row.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setActionConfigRows((prev) => [...prev, makeRow()])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add config row
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => step > 1 && setStep((prev) => prev - 1)} disabled={step === 1}>
                Back
              </Button>
              {step < 4 ? (
                <Button onClick={() => canGoNext && setStep((prev) => prev + 1)} disabled={!canGoNext}>
                  Next
                </Button>
              ) : (
                <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={submitAutomation}>
                  {isEditing ? "Save Changes" : "Create Automation"}
                </Button>
              )}
            </div>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
