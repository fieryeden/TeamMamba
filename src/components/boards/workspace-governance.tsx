"use client";

import { useState } from "react";
import { Download, Archive, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WorkspaceGovernance({ workspaceId }: { workspaceId: string }) {
  const [autoArchiveDays, setAutoArchiveDays] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastExported, setLastExported] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<number | null>(null);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const days = parseInt(autoArchiveDays, 10);
      if (!isNaN(days) && days > 0) {
        await fetch("/api/workspaces/governance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, autoArchiveDays: days, retentionDays: parseInt(retentionDays, 10) || null }),
        });
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const triggerExport = () => {
    window.location.href = `/api/governance/export?workspaceId=${workspaceId}`;
    setLastExported(new Date().toLocaleString());
  };

  const triggerArchive = async () => {
    try {
      const res = await fetch("/api/governance/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, action: "autoArchive" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastArchived(data.archived ?? 0);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Shield className="h-4 w-4" /> Data Governance
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Auto-Archive (days)</label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="90"
            value={autoArchiveDays}
            onChange={(e) => setAutoArchiveDays(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">Auto-archive inactive items</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Retention Period (days)</label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="365"
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">Data retention limit</p>
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={triggerExport}>
          <Download className="mr-1 h-3 w-3" /> Export All Data
          {lastExported && <span className="ml-1 text-[10px] text-muted-foreground">({lastExported})</span>}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={triggerArchive}>
          <Archive className="mr-1 h-3 w-3" /> Run Auto-Archive
          {lastArchived !== null && <span className="ml-1 text-[10px] text-green-600">{lastArchived} archived</span>}
        </Button>
      </div>
    </div>
  );
}
