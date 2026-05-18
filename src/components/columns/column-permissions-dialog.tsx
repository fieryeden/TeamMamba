"use client";

import { useState, useEffect } from "react";
import { BoardRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Shield } from "lucide-react";

interface ColumnShape {
  id: string;
  title: string;
  columnType: string;
}

interface PermissionEntry {
  id?: string;
  columnId: string;
  role: BoardRole;
  canView: boolean;
  canEdit: boolean;
}

interface ColumnPermissionsDialogProps {
  boardId: string;
  columns: ColumnShape[];
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

const ROLES: BoardRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

function toLabel(role: BoardRole): string {
  const labels: Record<BoardRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    VIEWER: "Viewer",
  };
  return labels[role];
}

export function ColumnPermissionsDialog({
  boardId,
  columns,
  open,
  onClose,
  onUpdate,
}: ColumnPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAllPermissions()
      .then((all) => {
        setPermissions(all);
        setDirty(false);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  async function fetchAllPermissions(): Promise<PermissionEntry[]> {
    const results = await Promise.all(
      columns.map(async (col) => {
        try {
          const res = await fetch(`/api/columns/${col.id}/permissions`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.permissions || []) as PermissionEntry[];
        } catch {
          return [];
        }
      })
    );
    const flat = results.flat();

    // Ensure every column×role has an entry (default: canView=true, canEdit=true)
    const entries: PermissionEntry[] = [];
    for (const col of columns) {
      for (const role of ROLES) {
        const existing = flat.find(
          (p) => p.columnId === col.id && p.role === role
        );
        entries.push(
          existing || {
            columnId: col.id,
            role,
            canView: true,
            canEdit: role !== "VIEWER",
          }
        );
      }
    }
    return entries;
  }

  function getPerm(columnId: string, role: BoardRole): PermissionEntry {
    return (
      permissions.find((p) => p.columnId === columnId && p.role === role) || {
        columnId,
        role,
        canView: true,
        canEdit: role !== "VIEWER",
      }
    );
  }

  function setPerm(
    columnId: string,
    role: BoardRole,
    field: "canView" | "canEdit",
    value: boolean
  ) {
    setPermissions((prev) => {
      const idx = prev.findIndex(
        (p) => p.columnId === columnId && p.role === role
      );
      const updated = [...prev];
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], [field]: value };
      } else {
        updated.push({
          columnId,
          role,
          canView: field === "canView" ? value : true,
          canEdit: field === "canEdit" ? value : role !== "VIEWER",
        });
      }
      return updated;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Group by column, batch-update each
      const byColumn = new Map<string, PermissionEntry[]>();
      for (const p of permissions) {
        if (!byColumn.has(p.columnId)) byColumn.set(p.columnId, []);
        byColumn.get(p.columnId)!.push(p);
      }

      await Promise.all(
        Array.from(byColumn.entries()).map(async ([columnId, perms]) => {
          await fetch(`/api/columns/${columnId}/permissions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              permissions: perms.map((p) => ({
                role: p.role,
                canView: p.canView,
                canEdit: p.canEdit,
              })),
            }),
          });
        })
      );

      setDirty(false);
      onUpdate?.();
    } catch (err) {
      console.error("Save column permissions error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-mamba-600" />
            Column-Level Permissions
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading permissions…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                    Role
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="px-2 py-1 text-center font-medium text-muted-foreground min-w-[100px]"
                    >
                      {col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role} className="border-t">
                    <td className="px-2 py-2 font-medium">{toLabel(role)}</td>
                    {columns.map((col) => {
                      const p = getPerm(col.id, role);
                      const isOwner = role === "OWNER";
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-2 text-center"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              <Switch
                                checked={p.canView}
                                disabled={isOwner}
                                onCheckedChange={(v) =>
                                  setPerm(col.id, role, "canView", v)
                                }
                                className="scale-75"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                              <Switch
                                checked={p.canEdit}
                                disabled={isOwner}
                                onCheckedChange={(v) =>
                                  setPerm(col.id, role, "canEdit", v)
                                }
                                className="scale-75"
                              />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-mamba-600 hover:bg-mamba-700"
          >
            {saving ? "Saving…" : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
