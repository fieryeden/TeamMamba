"use client";

import { useState } from "react";
import { Users, UserPlus, Shield, Mail, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, formatRelativeTime } from "@/lib/utils";

interface TeamMember {
  user: {
    id: string; firstName: string; lastName: string; email: string;
    avatarUrl: string | null; role: string; status: string; lastLoginAt: string | null;
  };
  role: string;
  workspace: { id: string; name: string };
  joinedAt: string;
}

interface TeamClientProps {
  currentUser: { id: string; firstName: string; lastName: string };
  members: TeamMember[];
}

export function TeamClient({ currentUser, members: initialMembers }: TeamClientProps) {
  const [members] = useState(initialMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  // Deduplicate by user ID
  const uniqueMembers = members.reduce<Map<string, TeamMember>>((map, m) => {
    if (!map.has(m.user.id)) map.set(m.user.id, m);
    return map;
  }, new Map());

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
                <Shield className="h-2.5 w-2.5 mr-1" />
                {m.role}
              </Badge>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">
                  {m.user.lastLoginAt ? `Last seen ${formatRelativeTime(m.user.lastLoginAt)}` : "Never logged in"}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Change Role</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <Button className="bg-mamba-600 hover:bg-mamba-700">
              <Mail className="h-3 w-3 mr-1" /> Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
