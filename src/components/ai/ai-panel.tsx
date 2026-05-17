"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, BarChart3, Wand2, ListChecks, FileText } from "lucide-react";

interface AIPanelProps {
  boardId: string;
  itemId?: string;
  onClose: () => void;
}

type AITab = "suggest" | "generate" | "summarize";

interface AIResult {
  summary?: string;
  totalItems?: number;
  completionRate?: number;
  overdueItems?: number;
  healthScore?: number;
  workload?: Record<string, number>;
  suggestions?: Array<{ name: string; itemCount: number; reason: string }>;
  suggestion?: string;
  confidence?: number;
  currentStatus?: string;
  created?: number;
  items?: Array<{ name: string }>;
  [key: string]: unknown;
}

export function AIPanel({ boardId, itemId, onClose }: AIPanelProps) {
  const [tab, setTab] = useState<AITab>("suggest");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Suggest state
  const [suggestAction, setSuggestAction] = useState("assign");

  // Generate state
  const [genDescription, setGenDescription] = useState("");

  const handleSuggest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, itemId, action: suggestAction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, description: genDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/summarize-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: AITab; label: string; icon: React.ReactNode }[] = [
    { key: "suggest", label: "Suggest", icon: <Wand2 className="h-3.5 w-3.5" /> },
    { key: "generate", label: "Generate", icon: <ListChecks className="h-3.5 w-3.5" /> },
    { key: "summarize", label: "Summarize", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-mamba-600" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
              tab === t.key ? "border-b-2 border-mamba-600 font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => { setTab(t.key); setResult(null); setError(null); }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "suggest" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Get AI-powered suggestions for your board.</p>
            <select
              value={suggestAction}
              onChange={(e) => setSuggestAction(e.target.value)}
              className="h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="assign">Suggest assignee</option>
              <option value="priority">Predict priority</option>
              <option value="status">Predict next status</option>
              <option value="categorize">Suggest group</option>
            </select>
            <Button size="sm" className="w-full bg-mamba-600 hover:bg-mamba-700" disabled={loading} onClick={handleSuggest}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />} Suggest
            </Button>
            {result && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                {suggestAction === "assign" && result.suggestions != null && (
                  <div className="space-y-1">
                    {result.suggestions!.map((s, i) => (
                      <div key={i} className="rounded bg-card p-2">
                        <span className="font-medium">{s.name}</span> ({s.itemCount} items)
                        <div className="text-muted-foreground">{s.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
                {suggestAction === "priority" && result.suggestion != null && (
                  <div>
                    Suggested: <span className="font-semibold">{result.suggestion}</span>
                    <span className="ml-2 text-muted-foreground">
                      (confidence: {Math.round(result.confidence ?? 0 * 100)}%)
                    </span>
                  </div>
                )}
                {suggestAction === "status" && result.suggestion != null && (
                  <div>
                    Next status: <span className="font-semibold">{result.suggestion}</span>
                    <span className="ml-2 text-muted-foreground">
                      (confidence: {Math.round(result.confidence ?? 0 * 100)}%)
                    </span>
                    {result.currentStatus != null && (
                      <div className="mt-1 text-muted-foreground">Current: {result.currentStatus}</div>
                    )}
                  </div>
                )}
                {suggestAction === "categorize" && (
                  <div>
                    {result.suggestion != null ? (
                      <>
                        Suggested group: <span className="font-semibold">{result.suggestion}</span>
                      </>
                    ) : (
                      "No clear group match found"
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "generate" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Describe items to create. Use commas, numbered lists, or line breaks.</p>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={4}
              placeholder={"e.g. &quot;Create: Landing page, API endpoints, DB schema, Auth flow, CI/CD pipeline&quot;"}
              value={genDescription}
              onChange={(e) => setGenDescription(e.target.value)}
            />
            <Button size="sm" className="w-full bg-mamba-600 hover:bg-mamba-700" disabled={loading || !genDescription.trim()} onClick={handleGenerate}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ListChecks className="mr-1 h-3 w-3" />} Generate Items
            </Button>
            {result && result.created != null && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-semibold">Created {result.created ?? 0} item{((result.created ?? 0) > 1 ? "s" : "")}</div>
                {result.items != null && (
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {result.items!.map((it, i) => (
                      <li key={i}>• {it.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "summarize" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Get an AI-powered summary of your board&apos;s status.</p>
            <Button size="sm" className="w-full bg-mamba-600 hover:bg-mamba-700" disabled={loading} onClick={handleSummarize}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BarChart3 className="mr-1 h-3 w-3" />} Summarize Board
            </Button>
            {result && result.summary != null && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
                <p>{result.summary}</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded bg-card p-2 text-center">
                    <div className="text-lg font-bold">{result.totalItems ?? 0}</div>
                    <div className="text-muted-foreground">Items</div>
                  </div>
                  <div className="rounded bg-card p-2 text-center">
                    <div className="text-lg font-bold">{result.completionRate ?? 0}%</div>
                    <div className="text-muted-foreground">Done</div>
                  </div>
                  <div className="rounded bg-card p-2 text-center">
                    <div className="text-lg font-bold">{result.overdueItems ?? 0}</div>
                    <div className="text-muted-foreground">Overdue</div>
                  </div>
                  <div className="rounded bg-card p-2 text-center">
                    <div className="text-lg font-bold">{result.healthScore ?? 0}</div>
                    <div className="text-muted-foreground">Health</div>
                  </div>
                </div>
                {result.workload && Object.keys(result.workload).length > 0 && (
                  <div className="pt-1">
                    <div className="font-semibold">Workload</div>
                    {Object.entries(result.workload).map(([name, count]) => (
                      <div key={name} className="flex justify-between">
                        <span>{name}</span>
                        <span className="text-muted-foreground">{count} items</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
