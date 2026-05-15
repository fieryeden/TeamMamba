"use client";

import { useState, useCallback } from "react";
import { Sparkles, Search, User, Tag, ArrowRight, Loader2, Zap, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Suggestion = {
  userId?: string;
  name?: string;
  itemCount?: number;
  reason?: string;
  suggestion?: string;
  confidence?: number;
  groupId?: string;
  groupName?: string;
  alternatives?: { groupId: string; groupName: string; score: number }[];
};

type SearchResult = {
  type: "item" | "doc" | "comment";
  id: string;
  title: string;
  snippet: string;
  boardId: string;
  boardName: string;
  score: number;
  url: string;
};

type BoardSummary = {
  totalItems: number;
  statusBreakdown: Record<string, number>;
  unassignedItems: number;
  overdueItems: number;
  memberCount: number;
  groupCount: number;
  healthScore: number;
};

interface AIPanelProps {
  boardId: string;
}

export function AIPanel({ boardId }: AIPanelProps) {
  const [loading, setLoading] = useState(false);
  const [assignSuggestion, setAssignSuggestion] = useState<Suggestion[]>([]);
  const [prioritySuggestion, setPrioritySuggestion] = useState<Suggestion | null>(null);
  const [statusSuggestion, setStatusSuggestion] = useState<Suggestion | null>(null);
  const [categorizeSuggestion, setCategorizeSuggestion] = useState<Suggestion | null>(null);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchSuggestion = useCallback(async (action: string, itemId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, itemId, action }),
      });
      if (res.ok) {
        const json = await res.json();
        switch (action) {
          case "assign":
            setAssignSuggestion(json.suggestions);
            break;
          case "priority":
            setPrioritySuggestion(json);
            break;
          case "status":
            setStatusSuggestion(json);
            break;
          case "categorize":
            setCategorizeSuggestion(json);
            break;
          case "summarize":
            setSummary(json);
            break;
        }
      }
    } catch (err) {
      console.error("AI suggestion error:", err);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      });
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.results);
      }
    } catch (err) {
      console.error("AI search error:", err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const confidenceColor = (c?: number) => {
    if (!c) return "text-muted-foreground";
    if (c >= 0.8) return "text-green-600";
    if (c >= 0.6) return "text-yellow-600";
    return "text-red-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-mamba-600" />
        <h3 className="text-sm font-semibold">AI Assistant</h3>
      </div>

      <Tabs defaultValue="smart">
        <TabsList className="w-full">
          <TabsTrigger value="smart" className="flex-1 text-xs">
            <Zap className="mr-1 h-3 w-3" /> Smart
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-1 text-xs">
            <Search className="mr-1 h-3 w-3" /> Search
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex-1 text-xs">
            <Brain className="mr-1 h-3 w-3" /> Summary
          </TabsTrigger>
        </TabsList>

        {/* Smart Suggestions */}
        <TabsContent value="smart" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSuggestion("assign")}
              disabled={loading}
              className="text-xs"
            >
              <User className="mr-1 h-3 w-3" /> Suggest Assignee
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSuggestion("summarize")}
              disabled={loading}
              className="text-xs"
            >
              <Brain className="mr-1 h-3 w-3" /> Board Health
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-mamba-600" />
            </div>
          )}

          {assignSuggestion.length > 0 && !loading && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">Suggested Assignees</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {assignSuggestion.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-mamba-100 text-xs font-bold text-mamba-700">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.reason}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {s.itemCount} items
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {summary && !loading && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium flex items-center justify-between">
                  Board Health
                  <Badge
                    variant={summary.healthScore >= 80 ? "default" : summary.healthScore >= 50 ? "secondary" : "destructive"}
                    className="text-[10px]"
                  >
                    {summary.healthScore}/100
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-lg font-bold">{summary.totalItems}</p>
                    <p className="text-muted-foreground">Items</p>
                  </div>
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-lg font-bold">{summary.memberCount}</p>
                    <p className="text-muted-foreground">Members</p>
                  </div>
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-lg font-bold text-yellow-600">{summary.unassignedItems}</p>
                    <p className="text-muted-foreground">Unassigned</p>
                  </div>
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{summary.overdueItems}</p>
                    <p className="text-muted-foreground">Overdue</p>
                  </div>
                </div>
                {Object.keys(summary.statusBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(summary.statusBreakdown).map(([status, count]) => (
                      <Badge key={status} variant="outline" className="text-[10px]">
                        {status}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Smart Search */}
        <TabsContent value="search" className="space-y-3 mt-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search across all boards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <a
                  key={`${r.type}-${r.id}`}
                  href={r.url}
                  className="block rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {r.type}
                    </Badge>
                    <span className="text-sm font-medium truncate">{r.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Board: {r.boardName}
                  </p>
                </a>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No results found. Try a different query.
            </p>
          )}
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => fetchSuggestion("summarize")}
            disabled={loading}
          >
            <Brain className="mr-1 h-3 w-3" /> Generate Board Summary
          </Button>
          {summary && !loading && (
            <Card className="mt-3">
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Health Score</span>
                  <span className={`text-2xl font-bold ${summary.healthScore >= 80 ? "text-green-600" : summary.healthScore >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {summary.healthScore}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${summary.healthScore >= 80 ? "bg-green-500" : summary.healthScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${summary.healthScore}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {summary.totalItems} items · {summary.groupCount} groups · {summary.memberCount} members
                  {summary.unassignedItems > 0 && ` · ${summary.unassignedItems} unassigned`}
                  {summary.overdueItems > 0 && ` · ${summary.overdueItems} overdue`}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
