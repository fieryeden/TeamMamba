"use client";

import { useState, useCallback } from "react";
import { Plus, Play, CheckCircle, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BurndownChart } from "@/components/boards/burndown-chart";

interface SprintItem {
  id: string;
  itemId: string;
  storyPoints: number | null;
  originalEstimate: number | null;
  burnedPoints: number;
  completedAt: string | null;
  item: { id: string; name: string };
}

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: string;
  velocity: number | null;
  items: SprintItem[];
  createdAt: string;
}

interface SprintPanelProps {
  boardId: string;
  sprints: Sprint[];
  onRefresh: () => void;
}

export function SprintPanel({ boardId, sprints, onRefresh }: SprintPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createSprint = useCallback(async () => {
    if (!name.trim() || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          name: name.trim(),
          goal: goal.trim() || undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setGoal("");
        setStartDate("");
        setEndDate("");
        onRefresh();
      }
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  }, [boardId, name, goal, startDate, endDate, onRefresh]);

  const updateSprintStatus = useCallback(async (sprintId: string, status: string) => {
    try {
      await fetch(`/api/sprints/${sprintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [onRefresh]);

  const deleteSprint = useCallback(async (sprintId: string) => {
    try {
      await fetch(`/api/sprints/${sprintId}`, { method: "DELETE" });
      onRefresh();
    } catch { /* ignore */ }
  }, [onRefresh]);

  const addItemToSprint = useCallback(async (sprintId: string, itemId: string, storyPoints?: number) => {
    try {
      await fetch(`/api/sprints/${sprintId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, storyPoints }),
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [onRefresh]);

  const activeSprint = sprints.find(s => s.status === "ACTIVE");
  const selectedSprintData = sprints.find(s => s.id === selectedSprint);

  const totalPoints = (items: SprintItem[]) => items.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const burnedPoints = (items: SprintItem[]) => items.reduce((sum, i) => sum + (i.burnedPoints ?? 0), 0);
  const completedItems = (items: SprintItem[]) => items.filter(i => i.completedAt).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Sprints</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-3 w-3" /> New Sprint
        </Button>
      </div>

      {/* Active Sprint */}
      {activeSprint && (
        <div className="rounded-lg border-2 border-mamba-400 bg-mamba-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{activeSprint.name}</h4>
                <Badge className="bg-mamba-600">Active</Badge>
              </div>
              {activeSprint.goal && (
                <p className="text-xs text-muted-foreground mt-1">🎯 {activeSprint.goal}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedSprint(activeSprint.id)}>
                <ChevronRight className="h-3 w-3" /> Details
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateSprintStatus(activeSprint.id, "COMPLETED")}>
                <CheckCircle className="h-3 w-3" /> Complete
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold">{totalPoints(activeSprint.items)}</p>
              <p className="text-xs text-muted-foreground">Total Points</p>
            </div>
            <div>
              <p className="text-lg font-bold">{burnedPoints(activeSprint.items)}</p>
              <p className="text-xs text-muted-foreground">Burned</p>
            </div>
            <div>
              <p className="text-lg font-bold">{completedItems(activeSprint.items)}/{activeSprint.items.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
          <Progress value={totalPoints(activeSprint.items) > 0 ? (burnedPoints(activeSprint.items) / totalPoints(activeSprint.items)) * 100 : 0} />
        </div>
      )}

      {/* Sprint List */}
      <div className="space-y-2">
        {sprints.filter(s => s.status !== "ACTIVE").map(sprint => (
          <div key={sprint.id} className="rounded-lg border p-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">{sprint.name}</h4>
                <Badge variant={sprint.status === "COMPLETED" ? "default" : "outline"} className="text-[10px]">
                  {sprint.status}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {sprint.status === "PLANNING" && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateSprintStatus(sprint.id, "ACTIVE")}>
                    <Play className="mr-1 h-3 w-3" /> Start
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelectedSprint(sprint.id)}>
                  Details
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteSprint(sprint.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>{new Date(sprint.startDate).toLocaleDateString()} → {new Date(sprint.endDate).toLocaleDateString()}</span>
              <span>{sprint.items.length} items · {totalPoints(sprint.items)} pts</span>
              {sprint.velocity !== null && <span>Velocity: {sprint.velocity}</span>}
            </div>
          </div>
        ))}
        {sprints.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No sprints yet. Create one to start planning.</p>
        )}
      </div>

      {/* Create Sprint Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sprint</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sprint Name</label>
              <Input placeholder="e.g. Sprint 1" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Goal (optional)</label>
              <Input placeholder="What do you want to achieve?" value={goal} onChange={e => setGoal(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start Date</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End Date</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={createSprint} disabled={!name.trim() || !startDate || !endDate || submitting}>
              {submitting ? "Creating..." : "Create Sprint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sprint Detail Dialog */}
      {selectedSprintData && (
        <Dialog open onOpenChange={() => setSelectedSprint(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedSprintData.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedSprintData.goal && (
                <p className="text-sm text-muted-foreground">🎯 {selectedSprintData.goal}</p>
              )}

              {/* Burndown */}
              {selectedSprintData.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Burndown</h4>
                  <BurndownChart
                    sprintId={selectedSprintData.id}
                    sprintName={selectedSprintData.name}
                    startDate={selectedSprintData.startDate}
                    endDate={selectedSprintData.endDate}
                    sprintItems={selectedSprintData.items}
                  />
                </div>
              )}

              {/* Sprint Items */}
              <div>
                <h4 className="text-sm font-medium mb-2">Items ({selectedSprintData.items.length})</h4>
                <div className="space-y-1 max-h-60 overflow-auto">
                  {selectedSprintData.items.map(si => (
                    <div key={si.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        {si.completedAt ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground" />
                        )}
                        <span className={`text-sm ${si.completedAt ? "line-through text-muted-foreground" : ""}`}>{si.item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {si.storyPoints !== null && <Badge variant="outline">{si.storyPoints} pts</Badge>}
                      </div>
                    </div>
                  ))}
                  {selectedSprintData.items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No items in this sprint</p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
