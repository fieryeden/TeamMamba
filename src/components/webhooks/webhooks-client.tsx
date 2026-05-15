"use client";

import { useState, useEffect, useCallback } from "react";
import { Webhook, Plus, Trash2, Play, CheckCircle, XCircle, Link, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type WebhookDelivery = {
  id: string;
  eventType: string;
  statusCode: number;
  success: boolean;
  createdAt: string;
};

type WebhookObj = {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  isEnabled: boolean;
  secret: string;
  createdAt: string;
  _count: { deliveries: number };
  deliveries: WebhookDelivery[];
};

type Board = { id: string; name: string; boardKind: string };

const WEBHOOK_EVENTS = [
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "ITEM_DELETED",
  "ITEM_MOVED_TO_BOARD",
  "COLUMN_VALUE_CHANGED",
  "ASSIGNEE_ADDED",
  "ASSIGNEE_REMOVED",
  "COMMENT_CREATED",
  "STATUS_CHANGED",
  "BOARD_CREATED",
  "BOARD_UPDATED",
];

interface WebhooksClientProps {
  boards: Board[];
}

export function WebhooksClient({ boards }: WebhooksClientProps) {
  const [webhooks, setWebhooks] = useState<WebhookObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState(boards[0]?.id ?? "");
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["ITEM_CREATED", "ITEM_UPDATED", "ITEM_DELETED"]);
  const [newDesc, setNewDesc] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    if (!selectedBoard) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/webhooks?boardId=${selectedBoard}`);
      if (res.ok) {
        const json = await res.json();
        setWebhooks(json.webhooks);
      }
    } catch (err) {
      console.error("Load webhooks error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBoard]);

  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);

  const createWebhook = async () => {
    if (!newUrl.trim() || !selectedBoard) return;
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: selectedBoard,
          url: newUrl.trim(),
          events: newEvents,
          description: newDesc.trim() || undefined,
          secret: newSecret || undefined,
        }),
      });
      if (res.ok) {
        await loadWebhooks();
        setShowAdd(false);
        setNewUrl("");
        setNewEvents(["ITEM_CREATED", "ITEM_UPDATED", "ITEM_DELETED"]);
        setNewDesc("");
        setNewSecret("");
      }
    } catch (err) {
      console.error("Create webhook error:", err);
    }
  };

  const deleteWebhook = async (id: string) => {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const toggleWebhook = async (webhook: WebhookObj) => {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !webhook.isEnabled }),
    });
    setWebhooks((prev) =>
      prev.map((w) => (w.id === webhook.id ? { ...w, isEnabled: !w.isEnabled } : w))
    );
  };

  const testWebhook = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        alert(json.success ? `✅ Ping successful (HTTP ${json.statusCode})` : `❌ Ping failed (HTTP ${json.statusCode})`);
        await loadWebhooks();
      }
    } catch {
      alert("❌ Ping failed — connection error");
    } finally {
      setTesting(null);
    }
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">Send real-time events to external services when board actions happen</p>
        </div>
        <Button onClick={() => setShowAdd(true)} disabled={!selectedBoard}>
          <Plus className="mr-1 h-4 w-4" /> Add Webhook
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Board:</label>
        <select
          className="rounded-lg border bg-transparent px-3 py-1.5 text-sm"
          value={selectedBoard}
          onChange={(e) => setSelectedBoard(e.target.value)}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.boardKind === "PRIVATE" ? "🔒" : ""}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading webhooks...</div>
      ) : webhooks.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
          <div className="text-center">
            <Webhook className="mx-auto mb-2 h-12 w-12" />
            <p className="text-lg font-medium">No webhooks</p>
            <p className="text-sm mt-1">Create a webhook to send board events to an external URL</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => {
            const recentFail = wh.deliveries?.filter((e) => !e.success).length ?? 0;

            return (
              <Card key={wh.id} className={!wh.isEnabled ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${wh.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        <Webhook className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-mono break-all">{wh.url}</CardTitle>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant={wh.isEnabled ? "default" : "secondary"}>
                            {wh.isEnabled ? "Active" : "Disabled"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {wh._count.deliveries} deliveries
                          </span>
                          {recentFail > 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> {recentFail} recent failures
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleWebhook(wh)}>
                        {wh.isEnabled ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => testWebhook(wh.id)} disabled={testing === wh.id}>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        {testing === wh.id ? "Testing..." : "Test"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteWebhook(wh.id)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {wh.description && (
                      <p className="text-sm text-muted-foreground">{wh.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {wh.events.map((ev) => (
                        <Badge key={ev} variant="outline" className="text-xs font-mono">{ev}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Secret: {wh.secret.substring(0, 8)}...</span>
                      <span>·</span>
                      <span>Created {new Date(wh.createdAt).toLocaleDateString()}</span>
                    </div>

                    {wh.deliveries && wh.deliveries.length > 0 && (
                      <div className="mt-3 rounded-lg border p-3">
                        <h4 className="text-xs font-semibold mb-2">Recent Deliveries</h4>
                        <div className="space-y-1">
                          {wh.deliveries.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-2 text-xs">
                              {ev.success ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              )}
                              <span className="font-mono">{ev.eventType}</span>
                              <span className="text-muted-foreground">HTTP {ev.statusCode}</span>
                              <span className="text-muted-foreground ml-auto">
                                {new Date(ev.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Payload URL</label>
              <Input placeholder="https://example.com/webhook" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input placeholder="e.g., Slack notification endpoint" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Secret (auto-generated if empty)</label>
              <Input placeholder="Leave blank to auto-generate" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Events</label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-xs font-mono cursor-pointer transition-colors ${
                      newEvents.includes(ev)
                        ? "border-mamba-600 bg-mamba-50 dark:bg-mamba-900/20"
                        : "hover:bg-accent"
                    }`}
                  >
                    <input type="checkbox" checked={newEvents.includes(ev)} onChange={() => toggleEvent(ev)} className="rounded" />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={createWebhook} disabled={!newUrl.trim()}>
              <Link className="mr-1 h-4 w-4" /> Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
