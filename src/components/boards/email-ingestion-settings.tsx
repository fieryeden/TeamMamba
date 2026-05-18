"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Copy, Check, Loader2 } from "lucide-react";

interface EmailIngestionSettingsProps {
  boardId: string;
  groups: Array<{ id: string; name: string }>;
}

export function EmailIngestionSettings({
  boardId,
  groups,
}: EmailIngestionSettingsProps) {
  const [address, setAddress] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [defaultGroupId, setDefaultGroupId] = useState<string>("");
  const [defaultStatus, setDefaultStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/email-address`);
      if (!res.ok) return;
      const data = await res.json();
      setAddress(data.address || "");
      setIsEnabled(data.isEnabled ?? true);
      setDefaultGroupId(data.defaultGroupId || "");
      setDefaultStatus(data.defaultStatus || "");
      setDirty(false);
    } catch (err) {
      console.error("Fetch email settings error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/boards/${boardId}/email-address`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled,
          defaultGroupId: defaultGroupId || null,
          defaultStatus: defaultStatus || null,
        }),
      });
      setDirty(false);
    } catch (err) {
      console.error("Save email settings error:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-mamba-600" />
          Email-to-Board
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email address with copy button */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">
            Board Email Address
          </label>
          <div className="flex items-center gap-2">
            <Input value={address} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send emails to this address to create items on this board.
          </p>
        </div>

        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable Email Ingestion</p>
            <p className="text-xs text-muted-foreground">
              Accept inbound emails to create board items.
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(v) => {
              setIsEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        {/* Default group */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">
            Default Group
          </label>
          <Select
            value={defaultGroupId}
            onValueChange={(v) => {
              setDefaultGroupId(v);
              setDirty(true);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a group…" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default status */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">
            Default Status
          </label>
          <Select
            value={defaultStatus}
            onValueChange={(v) => {
              setDefaultStatus(v);
              setDirty(true);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Not Started">Not Started</SelectItem>
              <SelectItem value="Working on it">Working on it</SelectItem>
              <SelectItem value="Stuck">Stuck</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-mamba-600 hover:bg-mamba-700"
          >
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              alert(`Send an email to ${address} to test!`);
            }}
          >
            Test
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
