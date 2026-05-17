"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Integration {
  id: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  boardId?: string;
  createdAt: string;
}

const INTEGRATION_CATALOG = [
  { type: "slack", name: "Slack", description: "Send notifications and create items from Slack messages", icon: "💬", configFields: ["webhookUrl", "channel"] },
  { type: "google_drive", name: "Google Drive", description: "Attach files from Google Drive to items", icon: "📁", configFields: ["folderId", "serviceAccountEmail"] },
  { type: "google_calendar", name: "Google Calendar", description: "Sync deadlines and timelines with Google Calendar", icon: "📅", configFields: ["calendarId", "serviceAccountEmail"] },
  { type: "outlook", name: "Outlook Calendar", description: "Sync with Microsoft Outlook Calendar", icon: "📆", configFields: ["calendarId", "tenantId"] },
  { type: "jira", name: "Jira", description: "Sync items with Jira issues", icon: "🎫", configFields: ["baseUrl", "projectKey", "apiToken"] },
  { type: "github", name: "GitHub", description: "Link commits, PRs, and issues to board items", icon: "🐙", configFields: ["repo", "accessToken"] },
  { type: "gitlab", name: "GitLab", description: "Connect GitLab projects and merge requests", icon: "🦊", configFields: ["baseUrl", "projectId", "accessToken"] },
  { type: "zapier", name: "Zapier", description: "Connect to 5000+ apps via Zapier webhooks", icon: "⚡", configFields: ["webhookUrl"] },
  { type: "webhook", name: "Custom Webhook", description: "Send HTTP requests on board events", icon: "🔗", configFields: ["url", "secret", "method"] },
  { type: "microsoft_teams", name: "Microsoft Teams", description: "Post notifications to Teams channels", icon: "👥", configFields: ["webhookUrl", "channel"] },
  { type: "asana", name: "Asana", description: "Sync tasks with Asana projects", icon: "✅", configFields: ["projectId", "accessToken"] },
  { type: "trello", name: "Trello", description: "Sync boards with Trello", icon: "📋", configFields: ["boardId", "apiKey", "apiToken"] },
  { type: "notion", name: "Notion", description: "Connect Notion databases and pages", icon: "📝", configFields: ["databaseId", "accessToken"] },
  { type: "salesforce", name: "Salesforce", description: "Sync CRM data with Salesforce", icon: "☁️", configFields: ["instanceUrl", "clientId", "clientSecret"] },
  { type: "hubspot", name: "HubSpot", description: "Connect HubSpot CRM pipelines", icon: "🟠", configFields: ["portalId", "apiKey"] },
  { type: "figma", name: "Figma", description: "Embed Figma designs in items", icon: "🎨", configFields: ["fileKey", "accessToken"] },
];

export function IntegrationsClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((data) => {
        setIntegrations(data.integrations ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!selectedType) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          config: configValues,
          enabled: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIntegrations((prev) => [data.integration, ...prev]);
        setShowAdd(false);
        setSelectedType(null);
        setConfigValues({});
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/integrations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, enabled: !enabled } : i)));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
  };

  const catalogEntry = INTEGRATION_CATALOG.find((c) => c.type === selectedType);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground">Connect TeamMamba to the tools you already use.</p>
        </div>
        <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={() => { setSelectedType(null); setConfigValues({}); setShowAdd(true); }}>
          + Add Integration
        </Button>
      </div>

      {/* Active integrations */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Active Integrations</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : integrations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No integrations configured yet. Add one from the catalog below.
          </div>
        ) : (
          <div className="space-y-2">
            {integrations.map((integration) => {
              const catalog = INTEGRATION_CATALOG.find((c) => c.type === integration.type);
              return (
                <div key={integration.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{catalog?.icon ?? "🔗"}</span>
                    <div>
                      <div className="text-sm font-medium">{catalog?.name ?? integration.type}</div>
                      <div className="text-xs text-muted-foreground">
                        {integration.enabled ? "Enabled" : "Disabled"} · Added {new Date(integration.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`relative h-5 w-9 rounded-full transition-colors ${integration.enabled ? "bg-mamba-600" : "bg-muted"}`}
                      onClick={() => handleToggle(integration.id, integration.enabled)}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${integration.enabled ? "left-4" : "left-0.5"}`} />
                    </button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(integration.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Catalog */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Integration Catalog</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_CATALOG.map((item) => (
            <button
              key={item.type}
              className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-mamba-500 hover:bg-accent/40"
              onClick={() => {
                setSelectedType(item.type);
                setConfigValues({});
                setShowAdd(true);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-semibold">{item.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); setSelectedType(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{catalogEntry ? `Add ${catalogEntry.name}` : "Add Integration"}</DialogTitle>
          </DialogHeader>

          {!selectedType ? (
            <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {INTEGRATION_CATALOG.map((item) => (
                <button
                  key={item.type}
                  className="flex items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent/40"
                  onClick={() => { setSelectedType(item.type); setConfigValues({}); }}
                >
                  <span>{item.icon}</span>
                  {item.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{catalogEntry?.description}</p>
              {catalogEntry?.configFields.map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-sm font-medium">{field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</label>
                  <Input
                    placeholder={field}
                    value={configValues[field] ?? ""}
                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setSelectedType(null); }}>Cancel</Button>
            {selectedType && (
              <Button className="bg-mamba-600 hover:bg-mamba-700" disabled={saving || !Object.values(configValues).some((v) => v.trim())} onClick={handleAdd}>
                {saving ? "Saving..." : "Add Integration"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
