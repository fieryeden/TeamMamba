"use client";

import { useEffect, useState } from "react";
import { Settings, User, Key, Bell, Palette, Shield, Copy, Check, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { useTheme } from "next-themes";
import { NotificationPermission } from "@/components/pwa/notification-permission";

interface SettingsClientProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    role: string;
    themePreference: "LIGHT" | "DARK" | "SYSTEM";
    timezone: string;
    emailNotificationsEnabled: boolean;
    emailOnMentions: boolean;
    emailOnAssignments: boolean;
    emailOnDueDates: boolean;
    twoFactorEnabled: boolean;
    createdAt: string;
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
  const [profileSaved, setProfileSaved] = useState(false);

  // API token state
  const [generating, setGenerating] = useState(false);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled);
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorQrCodeUrl, setTwoFactorQrCodeUrl] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState({
    emailNotificationsEnabled: user.emailNotificationsEnabled,
    emailOnMentions: user.emailOnMentions,
    emailOnAssignments: user.emailOnAssignments,
    emailOnDueDates: user.emailOnDueDates,
  });

  // Appearance state
  const { theme, setTheme } = useTheme();
  const [themePreference, setThemePreference] = useState<"LIGHT" | "DARK" | "SYSTEM">(user.themePreference);
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tm-accent") || "#3b82f6";
    return "#3b82f6";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = localStorage.getItem("tm-theme");
    if (!storedTheme) {
      const initialTheme = user.themePreference.toLowerCase();
      setTheme(initialTheme);
      setThemePreference(user.themePreference);
      return;
    }
    if (storedTheme === "light") setThemePreference("LIGHT");
    if (storedTheme === "dark") setThemePreference("DARK");
    if (storedTheme === "system") setThemePreference("SYSTEM");
  }, [setTheme, user.themePreference]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setProfileSaved(false);
    try {
      await fetch(`/api/auth`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateToken = async () => {
    if (!newTokenName.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName }),
      });
      if (res.ok) {
        const data = await res.json();
        setTokens((prev) => [data.token, ...prev]);
        setRawToken(data.rawToken);
        setNewTokenName("");
        setShowTokenDialog(true);
      }
    } catch (err) {
      console.error("Failed to generate token:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeToken = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error("Failed to revoke token:", err);
    } finally {
      setRevokingId(null);
    }
  };

  const copyToken = () => {
    if (rawToken) {
      navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleThemeChange = async (newTheme: "LIGHT" | "DARK" | "SYSTEM") => {
    setThemePreference(newTheme);
    setTheme(newTheme.toLowerCase());
    setThemeSaving(true);
    try {
      await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themePreference: newTheme }),
      });
    } catch (err) {
      console.error("Failed to update theme preference:", err);
    } finally {
      setThemeSaving(false);
    }
  };

  const handleAccentChange = (color: string) => {
    setAccentColor(color);
    localStorage.setItem("tm-accent", color);
    document.documentElement.style.setProperty("--accent", color);
  };

  const handleEmailPrefChange = async (key: keyof typeof emailPrefs, value: boolean) => {
    const next = { ...emailPrefs, [key]: value };
    setEmailPrefs(next);
    try {
      await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch (err) {
      console.error("Failed to update email preference:", err);
    }
  };

  const setupTwoFactor = async () => {
    setTwoFactorLoading(true);
    setTwoFactorMessage("");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTwoFactorMessage(data.error ?? "Failed to start setup");
        return;
      }
      setTwoFactorSetupSecret(data.secret ?? "");
      setTwoFactorQrCodeUrl(data.qrCodeUrl ?? "");
    } catch {
      setTwoFactorMessage("Failed to start setup");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const verifyTwoFactor = async () => {
    if (!twoFactorCode.trim()) return;
    setTwoFactorLoading(true);
    setTwoFactorMessage("");
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFactorCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTwoFactorMessage(data.error ?? "Invalid verification code");
        return;
      }
      setTwoFactorEnabled(true);
      setTwoFactorSetupSecret("");
      setTwoFactorQrCodeUrl("");
      setTwoFactorCode("");
      setTwoFactorMessage("Two-factor authentication is enabled.");
    } catch {
      setTwoFactorMessage("Failed to verify code");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!twoFactorCode.trim()) return;
    setTwoFactorLoading(true);
    setTwoFactorMessage("");
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFactorCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTwoFactorMessage(data.error ?? "Invalid verification code");
        return;
      }
      setTwoFactorEnabled(false);
      setTwoFactorSetupSecret("");
      setTwoFactorQrCodeUrl("");
      setTwoFactorCode("");
      setTwoFactorMessage("Two-factor authentication is disabled.");
    } catch {
      setTwoFactorMessage("Failed to disable 2FA");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        Settings
      </h1>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile"><User className="h-3 w-3 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="api"><Key className="h-3 w-3 mr-1" /> API Tokens</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3 w-3 mr-1" /> Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3 w-3 mr-1" /> Security</TabsTrigger>
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
                {saving ? "Saving..." : profileSaved ? "Saved ✓" : "Save Changes"}
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
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateToken()}
                  className="max-w-xs"
                />
                <Button
                  onClick={handleGenerateToken}
                  disabled={generating || !newTokenName.trim()}
                  className="bg-mamba-600 hover:bg-mamba-700"
                >
                  {generating ? "Generating..." : "Generate Token"}
                </Button>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={revokingId === token.id}
                        onClick={() => handleRevokeToken(token.id)}
                      >
                        {revokingId === token.id ? (
                          "Revoking..."
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3 mr-1" /> Revoke
                          </>
                        )}
                      </Button>
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
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what you want to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "emailNotificationsEnabled", label: "Email notifications", desc: "Master toggle for email alerts" },
                { key: "emailOnAssignments", label: "Item assigned to me", desc: "Get notified when someone assigns you an item" },
                { key: "emailOnMentions", label: "Comments and mentions", desc: "When someone mentions you in a comment" },
                { key: "emailOnDueDates", label: "Due date reminders", desc: "Remind me before items are due" },
              ].map((pref) => (
                <label key={pref.label} className="flex items-center justify-between rounded-lg border p-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailPrefs[pref.key as keyof typeof emailPrefs]}
                    onChange={(event) =>
                      handleEmailPrefChange(
                        pref.key as keyof typeof emailPrefs,
                        event.target.checked
                      )
                    }
                    className="h-4 w-4 rounded"
                  />
                </label>
              ))}
            </CardContent>
          </Card>
          <NotificationPermission userId={user.id} />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication (TOTP)</CardTitle>
              <CardDescription>Add an authenticator app code to your login</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={twoFactorEnabled ? "default" : "secondary"}>
                  {twoFactorEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              {!twoFactorEnabled && !twoFactorQrCodeUrl && (
                <Button onClick={setupTwoFactor} disabled={twoFactorLoading} className="bg-mamba-600 hover:bg-mamba-700">
                  {twoFactorLoading ? "Preparing..." : "Set up 2FA"}
                </Button>
              )}

              {!twoFactorEnabled && twoFactorQrCodeUrl && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">Scan this QR in your authenticator app</p>
                  <img src={twoFactorQrCodeUrl} alt="2FA QR code" className="h-44 w-44 rounded border" />
                  <p className="text-xs text-muted-foreground break-all">Secret: {twoFactorSetupSecret}</p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Enter 6-digit code"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(event) => event.key === "Enter" && verifyTwoFactor()}
                    />
                    <Button onClick={verifyTwoFactor} disabled={twoFactorLoading || twoFactorCode.length !== 6}>
                      Verify
                    </Button>
                  </div>
                </div>
              )}

              {twoFactorEnabled && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">Enter your current code to disable 2FA.</p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Enter 6-digit code"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(event) => event.key === "Enter" && disableTwoFactor()}
                    />
                    <Button variant="destructive" onClick={disableTwoFactor} disabled={twoFactorLoading || twoFactorCode.length !== 6}>
                      Disable
                    </Button>
                  </div>
                </div>
              )}

              {twoFactorMessage && (
                <p className="text-sm text-muted-foreground">{twoFactorMessage}</p>
              )}
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
                  {["LIGHT", "DARK", "SYSTEM"].map((t) => (
                    <button
                      key={t}
                      onClick={() => handleThemeChange(t as "LIGHT" | "DARK" | "SYSTEM")}
                      className={`rounded-lg border p-4 text-sm font-medium hover:bg-accent transition-colors text-center ${
                        themePreference === t ? "border-mamba-500 bg-mamba-50 ring-2 ring-mamba-500/30" : ""
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {themeSaving ? "Saving theme..." : `Current mode: ${(theme ?? "system").toUpperCase()}`}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Accent Color</label>
                <div className="flex gap-2">
                  {["#16a34a", "#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#ec4899"].map((color) => (
                    <button
                      key={color}
                      onClick={() => handleAccentChange(color)}
                      className={`h-8 w-8 rounded-full border-2 transition-colors ${
                        accentColor === color ? "border-foreground scale-110" : "border-transparent hover:border-foreground/20"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Token Created Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Token Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copy this token now — you won&apos;t be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted p-2 text-xs break-all">{rawToken}</code>
              <Button variant="outline" size="icon" onClick={copyToken}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTokenDialog(false)} className="bg-mamba-600 hover:bg-mamba-700">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
