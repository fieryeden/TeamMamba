"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, BarChart3, Wand2, ListChecks, MessageSquare, Send } from "lucide-react";

interface AIPanelProps {
  boardId: string;
  itemId?: string;
  onClose: () => void;
}

type AITab = "suggest" | "generate" | "summarize" | "chat";

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

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
  currentStatus?: string | null;
  created?: number;
  items?: Array<{ name: string }>;
  provider?: "openai" | "anthropic" | "none";
  fallback?: boolean;
  [key: string]: unknown;
}

export function AIPanel({ boardId, itemId, onClose }: AIPanelProps) {
  const [tab, setTab] = useState<AITab>("suggest");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suggestAction, setSuggestAction] = useState("assign");
  const [genDescription, setGenDescription] = useState("");

  const [llmConfigured, setLlmConfigured] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [conversation, setConversation] = useState<ChatEntry[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      setStatusLoading(true);
      try {
        const res = await fetch("/api/ai/chat", { method: "GET" });
        const data = await res.json();
        setLlmConfigured(Boolean(data.configured));
      } catch {
        setLlmConfigured(false);
      } finally {
        setStatusLoading(false);
      }
    };
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [conversation, chatLoading]);

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

  const handleChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const userMessage: ChatEntry = { role: "user", content: trimmed };
    setConversation((prev) => [...prev, userMessage]);
    setChatInput("");
    setError(null);
    setChatLoading(true);

    try {
      const payloadHistory = [...conversation, userMessage].map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          message: trimmed,
          conversationHistory: payloadHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response ?? "No response generated.",
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
        },
      ]);
      if (typeof data.fallback === "boolean") {
        setLlmConfigured(!data.fallback || data.provider !== "none");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't process that request right now.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const tabs: { key: AITab; label: string; icon: React.ReactNode }[] = [
    { key: "suggest", label: "Suggest", icon: <Wand2 className="h-3.5 w-3.5" /> },
    { key: "generate", label: "Generate", icon: <ListChecks className="h-3.5 w-3.5" /> },
    { key: "summarize", label: "Summarize", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: "chat", label: "Chat", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-mamba-600" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>

      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-[11px] text-muted-foreground">LLM status</span>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              !statusLoading && llmConfigured ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
          <span className="text-muted-foreground">
            {statusLoading ? "Checking..." : llmConfigured ? "Configured" : "Fallback mode"}
          </span>
        </div>
      </div>

      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
              tab === t.key ? "border-b-2 border-mamba-600 font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setTab(t.key);
              setResult(null);
              setError(null);
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

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
                    {result.suggestions.map((s, i) => (
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
                      (confidence: {Math.round((result.confidence ?? 0) * 100)}%)
                    </span>
                  </div>
                )}
                {suggestAction === "status" && result.suggestion != null && (
                  <div>
                    Next status: <span className="font-semibold">{result.suggestion}</span>
                    <span className="ml-2 text-muted-foreground">
                      (confidence: {Math.round((result.confidence ?? 0) * 100)}%)
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
                    {result.items.map((it, i) => (
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

        {tab === "chat" && (
          <div className="flex h-full flex-col gap-2">
            <p className="text-xs text-muted-foreground">Ask about board progress, risks, workload, or next actions.</p>
            <div ref={chatScrollRef} className="h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {conversation.length === 0 && (
                <div className="rounded bg-card p-2 text-xs text-muted-foreground">
                  Ask: "What is blocking progress?" or "Who has the most workload?"
                </div>
              )}
              {conversation.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  className={`rounded-md p-2 text-xs ${
                    entry.role === "user" ? "ml-8 bg-mamba-600/10" : "mr-8 bg-card"
                  }`}
                >
                  <div className="mb-1 font-semibold text-[11px] uppercase text-muted-foreground">{entry.role}</div>
                  <div>{entry.content}</div>
                  {entry.suggestions && entry.suggestions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {entry.suggestions.map((suggestion, suggestionIndex) => (
                        <div key={`${index}-s-${suggestionIndex}`} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="mr-8 rounded-md bg-card p-2 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this board..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleChat();
                  }
                }}
              />
              <Button size="sm" className="bg-mamba-600 hover:bg-mamba-700" onClick={handleChat} disabled={chatLoading || !chatInput.trim()}>
                {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
