"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAllViews, getBuiltinViews, getCustomViews, unregisterView, type BoardViewConfig } from "@/lib/view-sdk";

export function ViewsManager() {
  const [views, setViews] = useState<BoardViewConfig[]>([]);
  const [builtins, setBuiltins] = useState<BoardViewConfig[]>([]);
  const [customs, setCustoms] = useState<BoardViewConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("🎨");

  useEffect(() => {
    setViews(getAllViews());
    setBuiltins(getBuiltinViews());
    setCustoms(getCustomViews());
  }, []);

  const handleDelete = (id: string) => {
    if (confirm("Delete this custom view?")) {
      unregisterView(id);
      setCustoms(getCustomViews());
      setViews(getAllViews());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Board Views</h3>
        <p className="text-xs text-muted-foreground">{views.length} views available</p>
      </div>

      {/* Built-in views */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground">Built-in Views</h4>
        <div className="grid grid-cols-2 gap-2">
          {builtins.map(view => (
            <div key={view.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
              <span>{view.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{view.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{view.description}</p>
              </div>
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Custom views */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground">Custom Views</h4>
        {customs.length > 0 ? (
          <div className="space-y-1">
            {customs.map(view => (
              <div key={view.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                <span>{view.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{view.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{view.description}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => handleDelete(view.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">No custom views registered</p>
        )}
      </div>

      {/* SDK Info */}
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <h4 className="text-xs font-semibold">Views SDK</h4>
        <p className="text-[10px] text-muted-foreground">
          Register custom views using <code className="bg-muted px-1 rounded">registerView()</code> from{" "}
          <code className="bg-muted px-1 rounded">@/lib/view-sdk</code>. Custom views appear in the board view selector alongside built-in views.
        </p>
        <div className="text-[10px] text-muted-foreground">
          <p className="font-medium">API:</p>
          <ul className="list-disc pl-4 space-y-0.5 mt-1">
            <li><code>registerView(config)</code> — Register a new view</li>
            <li><code>unregisterView(id)</code> — Remove a custom view</li>
            <li><code>getAllViews()</code> — List all views</li>
            <li><code>getView(id)</code> — Get a specific view</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
