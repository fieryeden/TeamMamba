"use client";

import { useState, useEffect, useCallback } from "react";
import { Milestone as MilestoneIcon, Plus, Trash2, Check, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  targetDate: string;
  color: string;
  completed: boolean;
  createdBy: { id: string; firstName: string; lastName: string };
};

interface MilestonesPanelProps {
  boardId: string;
}

export function MilestonesPanel({ boardId }: MilestonesPanelProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newColor, setNewColor] = useState("#579bfc");

  const loadMilestones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/milestones?boardId=${boardId}`);
      if (res.ok) {
        const json = await res.json();
        setMilestones(json.milestones);
      }
    } catch (err) {
      console.error("Load milestones error:", err);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

  const addMilestone = async () => {
    if (!newTitle.trim() || !newDate) return;
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: newTitle.trim(),
          targetDate: newDate,
          color: newColor,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setMilestones((prev) => [...prev, json.milestone]);
        setShowAdd(false);
        setNewTitle("");
        setNewDate("");
      }
    } catch (err) {
      console.error("Add milestone error:", err);
    }
  };

  const toggleComplete = async (m: Milestone) => {
    try {
      const res = await fetch(`/api/milestones/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !m.completed }),
      });
      if (res.ok) {
        const json = await res.json();
        setMilestones((prev) =>
          prev.map((ms) => (ms.id === m.id ? json.milestone : ms))
        );
      }
    } catch (err) {
      console.error("Toggle milestone error:", err);
    }
  };

  const deleteMilestone = async (id: string) => {
    await fetch(`/api/milestones/${id}`, { method: "DELETE" });
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const COLORS = ["#579bfc", "#e2445c", "#fdab3d", "#00c875", "#a25ddc", "#ff158a", "#ff642e", "#037f4c"];

  const now = new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Flag className="h-4 w-4 text-mamba-600" /> Milestones
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : milestones.length === 0 ? (
        <p className="text-xs text-muted-foreground">No milestones. Add one to track key dates.</p>
      ) : (
        <div className="space-y-2">
          {milestones.map((m) => {
            const targetDate = new Date(m.targetDate);
            const isOverdue = !m.completed && targetDate < now;
            const isToday = targetDate.toDateString() === now.toDateString();

            return (
              <div
                key={m.id}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                  m.completed
                    ? "opacity-60 bg-muted/50"
                    : isOverdue
                    ? "border-red-200 bg-red-50/50 dark:bg-red-950/20"
                    : isToday
                    ? "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20"
                    : ""
                }`}
              >
                <button
                  onClick={() => toggleComplete(m)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    m.completed
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-muted-foreground/30 hover:border-mamba-600"
                  }`}
                >
                  {m.completed && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className={`font-medium truncate ${m.completed ? "line-through" : ""}`}>
                      {m.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{format(targetDate, "MMM d, yyyy")}</span>
                    {isOverdue && <span className="text-red-500 font-medium">Overdue</span>}
                    {isToday && <span className="text-yellow-600 font-medium">Today</span>}
                  </div>
                  {m.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteMilestone(m.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Milestone Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Milestone title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium">Color</label>
              <div className="mt-2 flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      newColor === c ? "scale-125 ring-2 ring-offset-2 ring-mamba-600" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addMilestone} disabled={!newTitle.trim() || !newDate}>
              <MilestoneIcon className="mr-1 h-4 w-4" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
