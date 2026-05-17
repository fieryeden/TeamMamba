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

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  conditions?: unknown;
  actionConfig?: unknown;
  enabled?: boolean;
  board?: { id: string; name: string; workspace?: { id: string; name: string } };
}

const TRIGGER_OPTIONS = [
  { value: "STATUS_CHANGED", label: "Status changes" },
  { value: "DATE_ARRIVED", label: "Date arrives" },
  { value: "ITEM_CREATED", label: "Item created" },
  { value: "ITEM_UPDATED", label: "Item updated" },
  { value: "ITEM_MOVED_TO_GROUP", label: "Item moved to group" },
  { value: "COLUMN_CHANGED", label: "Column value changes" },
];

const CONDITION_OPERATORS = [
  { value: "field_equals", label: "equals" },
  { value: "field_not_equals", label: "not equals" },
  { value: "field_contains", label: "contains" },
  { value: "field_is_empty", label: "is empty" },
  { value: "field_greater_than", label: "greater than" },
  { value: "field_less_than", label: "less than" },
];

const ACTION_OPTIONS = [
  { value: "change_status", label: "Change status" },
  { value: "move_item_to_group", label: "Move to group" },
  { value: "assign_user", label: "Assign user" },
  { value: "send_notification", label: "Send notification" },
  { value: "send_email", label: "Send email" },
  { value: "create_item", label: "Create item" },
  { value: "update_column", label: "Update column value" },
  { value: "add_tag", label: "Add tag" },
];

const RECIPES = [
  {
    name: "Auto-complete: move to Done group",
    description: "When status changes to Done, move item to the Completed group",
    trigger: "STATUS_CHANGED",
    conditions: { logic: "AND", conditions: [{ field: "column.status", operator: "field_equals", value: "Done" }] },
    action: "move_item_to_group",
    actionConfig: { targetGroupId: "completed" },
  },
  {
    name: "Due date reminder",
    description: "When a date arrives, notify the assignee",
    trigger: "DATE_ARRIVED",
    conditions: null,
    action: "send_notification",
    actionConfig: { toAssignees: true, title: "Due date reached", body: "An item you're assigned to has reached its due date." },
  },
  {
    name: "New item auto-assign",
    description: "When an item is created, assign it to the board owner",
    trigger: "ITEM_CREATED",
    conditions: null,
    action: "assign_user",
    actionConfig: { userId: "__owner__" },
  },
  {
    name: "Stuck → notify team",
    description: "When status changes to Stuck, send an email notification",
    trigger: "STATUS_CHANGED",
    conditions: { logic: "AND", conditions: [{ field: "column.status", operator: "field_equals", value: "Stuck" }] },
    action: "send_email",
    actionConfig: { to: "", subject: "Item stuck!", body: "An item on your board is now marked as Stuck." },
  },
  {
    name: "Auto-tag by keyword",
    description: "When item is updated and name contains 'bug', add the bug tag",
    trigger: "ITEM_UPDATED",
    conditions: { logic: "AND", conditions: [{ field: "name", operator: "field_contains", value: "bug" }] },
    action: "add_tag",
    actionConfig: { tag: "bug" },
  },
];

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ActionStep {
  action: string;
  config: Record<string, string>;
}

export function AutomationsClient({ automations: initialAutomations }: { automations: Automation[] }) {
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderStep, setBuilderStep] = useState<"trigger" | "conditions" | "actions" | "review">("trigger");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("STATUS_CHANGED");
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [actions, setActions] = useState<ActionStep[]>([{ action: "change_status", config: {} }]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const addCondition = () => setConditions((prev) => [...prev, { field: "", operator: "field_equals", value: "" }]);
  const removeCondition = (idx: number) => setConditions((prev) => prev.filter((_, i) => i !== idx));
  const updateCondition = (idx: number, key: keyof ConditionRow, val: string) =>
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: val } : c)));

  const addAction = () => setActions((prev) => [...prev, { action: "change_status", config: {} }]);
  const removeAction = (idx: number) => setActions((prev) => prev.filter((_, i) => i !== idx));
  const updateAction = (idx: number, key: "action" | string, val: string) =>
    setActions((prev) =>
      prev.map((a, i) => (i === idx ? (key === "action" ? { action: val, config: {} } : { ...a, config: { ...a.config, [key]: val } }) : a))
    );

  const resetBuilder = () => {
    setName("");
    setTrigger("STATUS_CHANGED");
    setConditions([]);
    setConditionLogic("AND");
    setActions([{ action: "change_status", config: {} }]);
    setBuilderStep("trigger");
    setShowBuilder(false);
  };

  const loadRecipe = (recipe: (typeof RECIPES)[number]) => {
    setName(recipe.name);
    setTrigger(recipe.trigger);
    if (recipe.conditions && typeof recipe.conditions === "object") {
      const rc = recipe.conditions as { logic?: string; conditions?: Array<{ field?: string; operator?: string; value?: unknown }> };
      setConditionLogic(rc.logic === "OR" ? "OR" : "AND");
      setConditions((rc.conditions ?? []).map((c) => ({ field: c.field ?? "", operator: c.operator ?? "field_equals", value: String(c.value ?? "") })));
    } else {
      setConditions([]);
    }
    setActions([{ action: recipe.action, config: ((recipe.actionConfig ?? {}) as unknown) as Record<string, string> }]);
    setBuilderStep("trigger");
    setShowBuilder(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const primaryAction = actions[0]?.action ?? "change_status";
      const primaryConfig = actions[0]?.config ?? {};
      const multiActions = actions.length > 1 ? actions : undefined;

      await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: automations[0]?.board?.id ?? "",
          name: name || "Untitled Automation",
          trigger,
          conditions: conditions.length
            ? { logic: conditionLogic, conditions }
            : undefined,
          action: primaryAction.toUpperCase(),
          actionConfig: multiActions
            ? { ...primaryConfig, actions: multiActions.map((a) => ({ action: a.action, config: a.config })) }
            : primaryConfig,
        }),
      });
      setShowBuilder(false);
      resetBuilder();
      // Refresh list
      const res = await fetch("/api/automations");
      if (res.ok) {
        const data = await res.json();
        setAutomations(data.automations ?? data ?? []);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/automations/${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)));
  };

  const stepIndex = ["trigger", "conditions", "actions", "review"].indexOf(builderStep);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-sm text-muted-foreground">Build rules that run automatically when things change.</p>
        </div>
        <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={() => { resetBuilder(); setShowBuilder(true); }}>
          + New Automation
        </Button>
      </div>

      {/* Recipes */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Recipes</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {RECIPES.map((recipe) => (
            <button
              key={recipe.name}
              className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-mamba-500 hover:bg-accent/40"
              onClick={() => loadRecipe(recipe)}
            >
              <div className="text-sm font-semibold">{recipe.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{recipe.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Existing automations list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Your Automations</h2>
        {automations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No automations yet. Create one above or pick a recipe.
          </div>
        ) : (
          <div className="space-y-2">
            {automations.map((automation) => (
              <div key={automation.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    className={`relative h-5 w-9 rounded-full transition-colors ${automation.enabled !== false ? "bg-mamba-600" : "bg-muted"}`}
                    onClick={() => handleToggle(automation.id, automation.enabled !== false)}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${automation.enabled !== false ? "left-4" : "left-0.5"}`}
                    />
                  </button>
                  <div>
                    <div className="text-sm font-medium">{automation.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {automation.trigger.replace(/_/g, " ")} → {automation.action.replace(/_/g, " ")}
                      {automation.board && <span className="ml-2">· {automation.board.name}</span>}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting === automation.id}
                  onClick={() => handleDelete(automation.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Builder dialog */}
      <Dialog open={showBuilder} onOpenChange={(open) => { if (!open) resetBuilder(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Build Automation</DialogTitle>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {["Trigger", "Conditions", "Actions", "Review"].map((label, idx) => (
              <div key={label} className="flex items-center gap-2">
                {idx > 0 && <div className={`h-0.5 w-8 ${idx <= stepIndex ? "bg-mamba-600" : "bg-muted"}`} />}
                <button
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    idx === stepIndex ? "bg-mamba-600 text-white" : idx < stepIndex ? "bg-mamba-200 text-mamba-800" : "bg-muted text-muted-foreground"
                  }`}
                  onClick={() => setBuilderStep(["trigger", "conditions", "actions", "review"][idx] as typeof builderStep)}
                >
                  {idx + 1}
                </button>
                <span className={`text-xs ${idx === stepIndex ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
              </div>
            ))}
          </div>

          <div className="min-h-[200px] space-y-4">
            {/* Step 1: Trigger */}
            {builderStep === "trigger" && (
              <div className="space-y-4">
                <Input placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />
                <div>
                  <label className="mb-1 block text-sm font-medium">When this happens:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TRIGGER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          trigger === opt.value ? "border-mamba-600 bg-mamba-50" : "hover:bg-accent/40"
                        }`}
                        onClick={() => setTrigger(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Conditions */}
            {builderStep === "conditions" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>Only if:</span>
                  <button
                    className={`rounded px-2 py-0.5 text-xs ${conditionLogic === "AND" ? "bg-mamba-600 text-white" : "bg-muted"}`}
                    onClick={() => setConditionLogic("AND")}
                  >
                    AND
                  </button>
                  <button
                    className={`rounded px-2 py-0.5 text-xs ${conditionLogic === "OR" ? "bg-mamba-600 text-white" : "bg-muted"}`}
                    onClick={() => setConditionLogic("OR")}
                  >
                    OR
                  </button>
                </div>
                {conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Field (e.g. column.status)"
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, "field", e.target.value)}
                      className="flex-1"
                    />
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(idx, "operator", e.target.value)}
                      className="h-9 rounded-md border px-2 text-sm"
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {cond.operator !== "field_is_empty" && (
                      <Input
                        placeholder="Value"
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, "value", e.target.value)}
                        className="flex-1"
                      />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeCondition(idx)}>✕</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCondition}>+ Add condition</Button>
                {conditions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No conditions — the automation will run for every matching trigger.</p>
                )}
              </div>
            )}

            {/* Step 3: Actions */}
            {builderStep === "actions" && (
              <div className="space-y-4">
                <label className="block text-sm font-medium">Then do this:</label>
                {actions.map((step, idx) => (
                  <div key={idx} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Step {idx + 1}</span>
                      {actions.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeAction(idx)}>✕</Button>
                      )}
                    </div>
                    <select
                      value={step.action}
                      onChange={(e) => updateAction(idx, "action", e.target.value)}
                      className="h-9 w-full rounded-md border px-2 text-sm"
                    >
                      {ACTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {(step.action === "change_status" || step.action === "update_column") && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Column ID"
                          value={step.config.columnId ?? ""}
                          onChange={(e) => updateAction(idx, "columnId", e.target.value)}
                        />
                        <Input
                          placeholder="Value"
                          value={step.config.value ?? ""}
                          onChange={(e) => updateAction(idx, "value", e.target.value)}
                        />
                      </div>
                    )}
                    {step.action === "move_item_to_group" && (
                      <Input
                        placeholder="Target Group ID"
                        value={step.config.targetGroupId ?? ""}
                        onChange={(e) => updateAction(idx, "targetGroupId", e.target.value)}
                      />
                    )}
                    {step.action === "assign_user" && (
                      <Input
                        placeholder="User ID (or __owner__)"
                        value={step.config.userId ?? ""}
                        onChange={(e) => updateAction(idx, "userId", e.target.value)}
                      />
                    )}
                    {step.action === "send_notification" && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Title"
                          value={step.config.title ?? ""}
                          onChange={(e) => updateAction(idx, "title", e.target.value)}
                        />
                        <Input
                          placeholder="Body message"
                          value={step.config.body ?? ""}
                          onChange={(e) => updateAction(idx, "body", e.target.value)}
                        />
                      </div>
                    )}
                    {step.action === "send_email" && (
                      <div className="space-y-2">
                        <Input
                          placeholder="To (email)"
                          value={step.config.to ?? ""}
                          onChange={(e) => updateAction(idx, "to", e.target.value)}
                        />
                        <Input
                          placeholder="Subject"
                          value={step.config.subject ?? ""}
                          onChange={(e) => updateAction(idx, "subject", e.target.value)}
                        />
                        <Input
                          placeholder="Body"
                          value={step.config.body ?? ""}
                          onChange={(e) => updateAction(idx, "body", e.target.value)}
                        />
                      </div>
                    )}
                    {step.action === "create_item" && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Item name"
                          value={step.config.itemName ?? ""}
                          onChange={(e) => updateAction(idx, "itemName", e.target.value)}
                        />
                        <Input
                          placeholder="Group ID"
                          value={step.config.groupId ?? ""}
                          onChange={(e) => updateAction(idx, "groupId", e.target.value)}
                        />
                      </div>
                    )}
                    {step.action === "add_tag" && (
                      <Input
                        placeholder="Tag name"
                        value={step.config.tag ?? ""}
                        onChange={(e) => updateAction(idx, "tag", e.target.value)}
                      />
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addAction}>+ Add action step</Button>
              </div>
            )}

            {/* Step 4: Review */}
            {builderStep === "review" && (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Name</div>
                  <div className="text-sm">{name || "Untitled Automation"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Trigger</div>
                  <div className="text-sm">{TRIGGER_OPTIONS.find((o) => o.value === trigger)?.label ?? trigger}</div>
                </div>
                {conditions.length > 0 && (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Conditions ({conditionLogic})</div>
                    {conditions.map((c, i) => (
                      <div key={i} className="text-sm">
                        {c.field} {CONDITION_OPERATORS.find((o) => o.value === c.operator)?.label} {c.value || "(empty)"}
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-md border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Actions</div>
                  {actions.map((a, i) => (
                    <div key={i} className="text-sm">
                      {i + 1}. {ACTION_OPTIONS.find((o) => o.value === a.action)?.label ?? a.action}
                      {Object.keys(a.config).length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({Object.entries(a.config).map(([k, v]) => `${k}=${v}`).join(", ")})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetBuilder}>Cancel</Button>
            {stepIndex > 0 && (
              <Button variant="outline" onClick={() => setBuilderStep(["trigger", "conditions", "actions", "review"][stepIndex - 1] as typeof builderStep)}>
                Back
              </Button>
            )}
            {stepIndex < 3 ? (
              <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={() => setBuilderStep(["trigger", "conditions", "actions", "review"][stepIndex + 1] as typeof builderStep)}>
                Next
              </Button>
            ) : (
              <Button className="bg-mamba-600 hover:bg-mamba-700" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : "Create Automation"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
