"use client";

import { useState } from "react";
import { Users, UserPlus, Shield, Mail, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";

interface TeamMember {
  membershipId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    lastLoginAt: string | null;
  };
  role: string;
  workspace: { id: string; name: string };
  joinedAt: string;
}

interface TeamClientProps {
  currentUser: { id: string; firstName: string; lastName: string };
  members: TeamMember[];
}

const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export function TeamClient({ currentUser, members: initialMembers }: TeamClientProps) {
  const [members, setMembers] = useState(initialMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    setInviteError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteEmail("");
        setShowInvite(false);
        // Refresh the page to show the new member
        window.location.reload();
      } else {
        setInviteError(data.error || "Failed to send invite");
      }
    } catch {
      setInviteError("Network error");
    } finally {
      setInviteSaving(false);
    }
  };
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [roleTarget, setRoleTarget] = useState<TeamMember | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  // Deduplicate by user ID, but keep the first membershipId for each
  const uniqueMembers = members.reduce<Map<string, TeamMember>>((map, m) => {
    if (!map.has(m.user.id)) map.set(m.user.id, m);
    return map;
  }, new Map());

  const handleChangeRole = async () => {
    if (!roleTarget || !selectedRole) return;
    setRoleSaving(true);
    try {
      const res = await fetch(`/api/memberships/${roleTarget.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.membershipId === roleTarget.membershipId ? { ...m, role: selectedRole } : m
          )
        );
        setShowRoleDialog(false);
        setRoleTarget(null);
      }
    } catch (err) {
      console.error("Failed to change role:", err);
    } finally {
      setRoleSaving(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    setRemovingMember(member.user.id);
    try {
      const res = await fetch(`/api/memberships/${member.membershipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.membershipId !== member.membershipId));
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    } finally {
      setRemovingMember(null);
    }
  };

  const openRoleDialog = (member: TeamMember) => {
    setRoleTarget(member);
    setSelectedRole(member.role);
    setShowRoleDialog(true);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Team
          </h1>
          <p className="text-muted-foreground text-sm">{uniqueMembers.size} members across your workspaces</p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="bg-mamba-600 hover:bg-mamba-700">
          <UserPlus className="h-4 w-4 mr-1" /> Invite Member
        </Button>
      </div>

      <div className="space-y-2">
        {Array.from(uniqueMembers.values()).map((m) => (
          <Card key={m.user.id}>
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-mamba-100 text-mamba-700 font-semibold">
                  {m.user.firstName[0]}{m.user.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{m.user.firstName} {m.user.lastName}</span>
                  {m.user.id === currentUser.id && <Badge variant="secondary" className="text-[10px]">You</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{m.user.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                <Shield className="h-2.5 w-2.5 mr-1" /> {m.role}
              </Badge>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">
                  {m.user.lastLoginAt ? `Last seen ${formatRelativeTime(m.user.lastLoginAt)}` : "Never logged in"}
                </p>
              </div>
              {m.user.id !== currentUser.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openRoleDialog(m)}>
                      Change Role
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={removingMember === m.user.id}
                      onClick={() => handleRemoveMember(m)}
                    >
                      {removingMember === m.user.id ? "Removing..." : "Remove"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button className="bg-mamba-600 hover:bg-mamba-700" disabled={!inviteEmail.trim() || inviteSaving} onClick={handleSendInvite}>
              <Mail className="h-3 w-3 mr-1" /> {inviteSaving ? "Sending..." : "Send Invite"}
            </Button>
            {inviteError && <p className="text-xs text-destructive mt-1">{inviteError}</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for {roleTarget?.user.firstName} {roleTarget?.user.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Workspace: {roleTarget?.workspace.name}</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              {WORKSPACE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRoleDialog(false)}>Cancel</Button>
            <Button
              onClick={handleChangeRole}
              disabled={roleSaving || !selectedRole || selectedRole === roleTarget?.role}
              className="bg-mamba-600 hover:bg-mamba-700"
            >
              {roleSaving ? "Saving..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
