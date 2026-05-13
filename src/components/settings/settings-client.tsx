"use client";

import { useState } from "react";
import { Settings, User, Key, Bell, Palette, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface SettingsClientProps {
  user: {
    id: string; email: string; firstName: string; lastName: string;
    avatarUrl: string | null; role: string; timezone: string; createdAt: string;
  };
  apiTokens: Array<{ id: string; name: string; lastUsed: string | null; createdAt: string }>;
}

export function SettingsClient({ user, apiTokens: initialTokens }: SettingsClientProps) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email] = useState(user.email);
  const [timezone] = useState(user.timezone);
  const [tokens, setTokens] = useState(initialTokens);
  const [newTokenName, setNewTokenName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await fetch(`/api/auth`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" /> Settings
      </h1>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile"><User className="h-3 w-3 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="api"><Key className="h-3 w-3 mr-1" /> API Tokens</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3 w-3 mr-1" /> Notifications</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="h-3 w-3 mr-1" /> Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">First Name</label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Last Name</label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input value={email} disabled className="bg-muted" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Timezone</label>
                <Input value={timezone} disabled className="bg-muted" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Role</label>
                <Badge>{user.role}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Member since</label>
                <span className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</span>
              </div>
              <Button onClick={handleSaveProfile} disabled={saving} className="bg-mamba-600 hover:bg-mamba-700">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Current Password</label>
                <Input type="password" className="bg-muted" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">New Password</label>
                  <Input type="password" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <Input type="password" />
                </div>
              </div>
              <Button variant="outline">Update Password</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Tokens</CardTitle>
              <CardDescription>Manage tokens for API access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Token name..."
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="max-w-xs"
                />
                <Button className="bg-mamba-600 hover:bg-mamba-700">Generate Token</Button>
              </div>

              {tokens.length > 0 ? (
                <div className="space-y-2">
                  {tokens.map((token) => (
                    <div key={token.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{token.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {formatDate(token.createdAt)}
                          {token.lastUsed && ` • Last used ${formatDate(token.lastUsed)}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive">Revoke</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No API tokens yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what you want to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Item assigned to me", desc: "Get notified when someone assigns you an item", default: true },
                { label: "Status changes", desc: "When an item you're following changes status", default: true },
                { label: "Comments and mentions", desc: "When someone mentions you in a comment", default: true },
                { label: "Due date reminders", desc: "Remind me before items are due", default: true },
                { label: "Automation activity", desc: "When automations run on your boards", default: false },
              ].map((pref) => (
                <label key={pref.label} className="flex items-center justify-between rounded-lg border p-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <input type="checkbox" defaultChecked={pref.default} className="h-4 w-4 rounded" />
                </label>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how TeamMamba looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Theme</label>
                <div className="grid grid-cols-3 gap-3">
                  {["Light", "Dark", "System"].map((theme) => (
                    <button
                      key={theme}
                      className="rounded-lg border p-4 text-sm font-medium hover:bg-accent transition-colors text-center"
                    >
                      {theme === "Light" && "☀️"}{theme === "Dark" && "🌙"}{theme === "System" && "💻"}
                      <br />{theme}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Accent Color</label>
                <div className="flex gap-2">
                  {["#16a34a", "#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#ec4899"].map((color) => (
                    <button
                      key={color}
                      className="h-8 w-8 rounded-full border-2 border-transparent hover:border-foreground/20 transition-colors"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
