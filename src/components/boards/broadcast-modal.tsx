"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function BroadcastModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "success">("info");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!title.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), severity }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => onClose(), 1500);
      }
    } catch {
      // handle error
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Message</label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="Optional message body..."
              rows={4}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Severity</label>
            <div className="flex gap-2">
              {(["info", "warning", "success"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`rounded-md border px-3 py-1 text-xs capitalize ${
                    severity === s
                      ? s === "info"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : s === "warning"
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-green-500 bg-green-50 text-green-700"
                      : "border-muted bg-background text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {sent && (
            <p className="text-xs text-green-600">✅ Announcement sent to all workspace members!</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-mamba-600 hover:bg-mamba-700"
            onClick={handleSend}
            disabled={!title.trim() || sending}
          >
            {sending ? "Sending..." : "Send Announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
