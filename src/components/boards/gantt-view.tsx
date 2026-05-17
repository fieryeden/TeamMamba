"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ColumnValue = {
  id: string;
  value: unknown;
  column: { id: string; title: string; columnType: string; config: unknown };
};

type Item = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  groupId: string;
  columnValues: ColumnValue[];
};

type Group = {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  items: Item[];
};

type Column = {
  id: string;
  title: string;
  columnType: string;
  config: unknown;
};

type Dependency = {
  id: string;
  fromItemId: string;
  toItemId: string;
  dependencyType: "FINISH_TO_START" | "START_TO_START" | "FINISH_TO_FINISH" | "START_TO_FINISH";
};

type ItemRangeRow = {
  itemId: string;
  itemName: string;
  itemIcon: string | null;
  groupId: string;
  groupName: string;
  groupColor: string;
  color: string;
  source: "TIMELINE" | "DATE";
  valueId: string;
  start: Date;
  end: Date;
};

type DisplayRow =
  | { kind: "group"; groupId: string; groupName: string; groupColor: string }
  | { kind: "item"; item: ItemRangeRow };

function parseRange(value: unknown): { start: Date; end: Date } | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const startRaw = entry.start ?? entry.from;
  const endRaw = entry.end ?? entry.to;
  if (typeof startRaw !== "string" || typeof endRaw !== "string") return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date) {
  const msPerDay = 86400000;
  return Math.max(1, Math.round((dateOnly(end).getTime() - dateOnly(start).getTime()) / msPerDay) + 1);
}

export function GanttView({
  boardId,
  groups,
  columns,
  onUpdateValue,
  onSelectItem,
}: {
  boardId: string;
  groups: Group[];
  columns: Column[];
  onUpdateValue: (valueId: string, value: unknown) => void;
  onSelectItem?: (itemId: string) => void;
}) {
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [tempRanges, setTempRanges] = useState<Record<string, { start: Date; end: Date }>>({});
  const [dragState, setDragState] = useState<{
    itemId: string;
    mode: "move" | "start" | "end";
    originX: number;
    originalStart: Date;
    originalEnd: Date;
    valueId: string;
    source: "TIMELINE" | "DATE";
  } | null>(null);

  const dayWidth = zoom === "day" ? 30 : zoom === "week" ? 16 : 8;
  const timelineColumn = columns.find((column) => column.columnType === "TIMELINE");
  const dateColumn = columns.find((column) => column.columnType === "DATE");

  useEffect(() => {
    setCollapsedGroups(
      Object.fromEntries(groups.map((group) => [group.id, Boolean(group.isCollapsed)]))
    );
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dependencies?boardId=${boardId}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve({ dependencies: [] })))
      .then((json) => {
        if (!cancelled) setDependencies((json.dependencies ?? []) as Dependency[]);
      })
      .catch(() => {
        if (!cancelled) setDependencies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, groups]);

  const itemRows = useMemo(() => {
    const rows: ItemRangeRow[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        const timelineValue = timelineColumn
          ? item.columnValues.find((entry) => entry.column.id === timelineColumn.id)
          : null;
        const timelineRange = timelineValue ? parseRange(timelineValue.value) : null;
        if (timelineRange && timelineValue) {
          rows.push({
            itemId: item.id,
            itemName: item.name,
            itemIcon: item.icon,
            groupId: group.id,
            groupName: group.name,
            groupColor: group.color,
            color: item.color || group.color || "#579bfc",
            source: "TIMELINE",
            valueId: timelineValue.id,
            start: dateOnly(timelineRange.start),
            end: dateOnly(timelineRange.end),
          });
          continue;
        }

        const dateValue = dateColumn
          ? item.columnValues.find((entry) => entry.column.id === dateColumn.id)
          : null;
        if (!dateValue || typeof dateValue.value !== "string") continue;
        const date = new Date(dateValue.value);
        if (Number.isNaN(date.getTime())) continue;
        rows.push({
          itemId: item.id,
          itemName: item.name,
          itemIcon: item.icon,
          groupId: group.id,
          groupName: group.name,
          groupColor: group.color,
          color: item.color || group.color || "#579bfc",
          source: "DATE",
          valueId: dateValue.id,
          start: dateOnly(date),
          end: dateOnly(date),
        });
      }
    }
    return rows;
  }, [dateColumn, groups, timelineColumn]);

  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = [];
    for (const group of groups) {
      rows.push({
        kind: "group",
        groupId: group.id,
        groupName: group.name,
        groupColor: group.color,
      });
      if (collapsedGroups[group.id]) continue;
      for (const row of itemRows.filter((entry) => entry.groupId === group.id)) {
        rows.push({ kind: "item", item: row });
      }
    }
    return rows;
  }, [collapsedGroups, groups, itemRows]);

  const visibleItemRows = useMemo(
    () => displayRows.filter((row): row is { kind: "item"; item: ItemRangeRow } => row.kind === "item"),
    [displayRows]
  );

  const rowByItemId = useMemo(() => {
    const map = new Map<string, ItemRangeRow>();
    for (const row of visibleItemRows) {
      const range = tempRanges[row.item.itemId];
      map.set(row.item.itemId, {
        ...row.item,
        start: range?.start ?? row.item.start,
        end: range?.end ?? row.item.end,
      });
    }
    return map;
  }, [tempRanges, visibleItemRows]);

  const criticalPath = useMemo(() => {
    const nodeDuration = new Map<string, number>();
    for (const row of itemRows) {
      const range = tempRanges[row.itemId];
      const start = range?.start ?? row.start;
      const end = range?.end ?? row.end;
      nodeDuration.set(row.itemId, daysBetween(start, end));
    }

    const adjacency = new Map<string, string[]>();
    for (const dep of dependencies) {
      if (!nodeDuration.has(dep.fromItemId) || !nodeDuration.has(dep.toItemId)) continue;
      const edges = adjacency.get(dep.fromItemId) ?? [];
      edges.push(dep.toItemId);
      adjacency.set(dep.fromItemId, edges);
    }

    const memo = new Map<string, { len: number; path: string[] }>();
    const visiting = new Set<string>();

    const walk = (nodeId: string): { len: number; path: string[] } => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      if (visiting.has(nodeId)) {
        return { len: nodeDuration.get(nodeId) ?? 1, path: [nodeId] };
      }
      visiting.add(nodeId);

      const duration = nodeDuration.get(nodeId) ?? 1;
      let bestChild: { len: number; path: string[] } | null = null;
      for (const nextId of adjacency.get(nodeId) ?? []) {
        const child = walk(nextId);
        if (!bestChild || child.len > bestChild.len) bestChild = child;
      }
      visiting.delete(nodeId);

      const result = bestChild
        ? { len: duration + bestChild.len, path: [nodeId, ...bestChild.path] }
        : { len: duration, path: [nodeId] };
      memo.set(nodeId, result);
      return result;
    };

    let best: { len: number; path: string[] } = { len: 0, path: [] };
    for (const nodeId of nodeDuration.keys()) {
      const candidate = walk(nodeId);
      if (candidate.len > best.len) best = candidate;
    }

    const edgeSet = new Set<string>();
    for (let idx = 0; idx < best.path.length - 1; idx += 1) {
      edgeSet.add(`${best.path[idx]}->${best.path[idx + 1]}`);
    }
    return { itemIds: new Set(best.path), edgeSet };
  }, [dependencies, itemRows, tempRanges]);

  const bounds = itemRows.length
    ? itemRows.map((row) => tempRanges[row.itemId] ?? { start: row.start, end: row.end })
    : [{ start: new Date(), end: new Date() }];
  const minDate = new Date(Math.min(...bounds.map((entry) => entry.start.getTime())));
  const maxDate = new Date(Math.max(...bounds.map((entry) => entry.end.getTime())));
  const pad = zoom === "day" ? 4 : zoom === "week" ? 12 : 24;
  const chartStart = addDays(dateOnly(minDate), -pad);
  const chartEnd = addDays(dateOnly(maxDate), pad);
  const totalDays = daysBetween(chartStart, chartEnd);
  const chartWidth = totalDays * dayWidth;
  const rowHeight = 36;
  const leftWidth = 360;
  const headerHeight = 34;
  const chartHeight = Math.max(visibleItemRows.length * rowHeight + 24, 80);

  const itemY = new Map<string, number>();
  visibleItemRows.forEach((row, idx) => {
    itemY.set(row.item.itemId, idx * rowHeight + 8);
  });

  const msPerDay = 86400000;
  const toX = (date: Date) => Math.round((dateOnly(date).getTime() - chartStart.getTime()) / msPerDay) * dayWidth;

  useEffect(() => {
    if (!dragState) return;

    const onMove = (event: PointerEvent) => {
      const deltaDays = Math.round((event.clientX - dragState.originX) / dayWidth);
      let nextStart = dragState.originalStart;
      let nextEnd = dragState.originalEnd;

      if (dragState.mode === "move") {
        nextStart = addDays(dragState.originalStart, deltaDays);
        nextEnd = addDays(dragState.originalEnd, deltaDays);
      } else if (dragState.mode === "start") {
        nextStart = addDays(dragState.originalStart, deltaDays);
        if (nextStart > nextEnd) nextStart = nextEnd;
      } else {
        nextEnd = addDays(dragState.originalEnd, deltaDays);
        if (nextEnd < nextStart) nextEnd = nextStart;
      }

      setTempRanges((prev) => ({
        ...prev,
        [dragState.itemId]: { start: dateOnly(nextStart), end: dateOnly(nextEnd) },
      }));
    };

    const onUp = () => {
      const range = tempRanges[dragState.itemId] ?? {
        start: dragState.originalStart,
        end: dragState.originalEnd,
      };
      if (dragState.source === "TIMELINE") {
        onUpdateValue(dragState.valueId, { start: toISODate(range.start), end: toISODate(range.end) });
      } else {
        onUpdateValue(dragState.valueId, toISODate(range.start));
      }
      setDragState(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dayWidth, dragState, onUpdateValue, tempRanges]);

  if (!itemRows.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Add data to Date or Timeline columns to use the Gantt view.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="text-sm font-semibold">Gantt</div>
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as const).map((value) => (
            <Button
              key={value}
              variant={zoom === value ? "default" : "outline"}
              size="sm"
              className={cn("h-8 capitalize", zoom === value && "bg-mamba-600 hover:bg-mamba-700")}
              onClick={() => setZoom(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="flex min-w-[1200px]">
          <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: leftWidth }}>
            <div className="sticky top-0 z-30 border-b bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
              Task List
            </div>
            {displayRows.map((row) => {
              if (row.kind === "group") {
                const collapsed = Boolean(collapsedGroups[row.groupId]);
                return (
                  <button
                    key={`group-${row.groupId}`}
                    className="flex h-9 w-full items-center gap-2 border-b px-3 text-left text-xs font-semibold"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({
                        ...prev,
                        [row.groupId]: !prev[row.groupId],
                      }))
                    }
                  >
                    <span style={{ color: row.groupColor }}>{collapsed ? "▸" : "▾"}</span>
                    <span style={{ color: row.groupColor }}>{row.groupName}</span>
                  </button>
                );
              }

              return (
                <button
                  key={row.item.itemId}
                  className="flex h-9 w-full items-center border-b px-3 text-left text-xs hover:bg-accent/40"
                  onClick={() => onSelectItem?.(row.item.itemId)}
                >
                  <span className="truncate">
                    {row.item.itemIcon ? `${row.item.itemIcon} ` : ""}
                    {row.item.itemName}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative" style={{ width: chartWidth }}>
            <div className="sticky top-0 z-10 border-b bg-card">
              <svg width={chartWidth} height={headerHeight}>
                {Array.from({ length: totalDays }, (_, idx) => {
                  const x = idx * dayWidth;
                  const date = addDays(chartStart, idx);
                  const day = date.getDay();
                  const showLabel =
                    zoom === "day" ||
                    (zoom === "week" && day === 1) ||
                    (zoom === "month" && date.getDate() === 1);
                  return (
                    <g key={`header-${idx}`}>
                      <line
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={headerHeight}
                        stroke="hsl(var(--border))"
                        strokeWidth={day === 1 ? 1.5 : 1}
                      />
                      {showLabel && (
                        <text x={x + 2} y={13} fontSize="10" fill="hsl(var(--muted-foreground))">
                          {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="relative">
              <svg width={chartWidth} height={chartHeight} className="block bg-background">
                <defs>
                  <marker
                    id="gantt-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                  </marker>
                  <marker
                    id="gantt-arrow-critical"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
                  </marker>
                </defs>

                {Array.from({ length: totalDays }, (_, idx) => {
                  const x = idx * dayWidth;
                  const date = addDays(chartStart, idx);
                  const isWeekStart = date.getDay() === 1;
                  return (
                    <line
                      key={`grid-${idx}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={chartHeight}
                      stroke="hsl(var(--border))"
                      strokeWidth={isWeekStart ? 1.2 : 1}
                    />
                  );
                })}

                {visibleItemRows.map((row, index) => {
                  const range = tempRanges[row.item.itemId] ?? { start: row.item.start, end: row.item.end };
                  const x = toX(range.start);
                  const width = Math.max(dayWidth, daysBetween(range.start, range.end) * dayWidth);
                  const y = index * rowHeight + 10;
                  const isCritical = criticalPath.itemIds.has(row.item.itemId);

                  return (
                    <g key={`bar-${row.item.itemId}`}>
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={16}
                        rx={8}
                        fill={row.item.color}
                        opacity={0.9}
                        stroke={isCritical ? "#dc2626" : "transparent"}
                        strokeWidth={isCritical ? 2 : 0}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          setDragState({
                            itemId: row.item.itemId,
                            mode: "move",
                            originX: event.clientX,
                            originalStart: range.start,
                            originalEnd: range.end,
                            valueId: row.item.valueId,
                            source: row.item.source,
                          });
                        }}
                        className="cursor-grab"
                      />
                      <rect
                        x={x - 3}
                        y={y - 1}
                        width={6}
                        height={18}
                        rx={3}
                        fill="rgba(15,23,42,0.2)"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          setDragState({
                            itemId: row.item.itemId,
                            mode: "start",
                            originX: event.clientX,
                            originalStart: range.start,
                            originalEnd: range.end,
                            valueId: row.item.valueId,
                            source: row.item.source,
                          });
                        }}
                        className="cursor-ew-resize"
                      />
                      <rect
                        x={x + width - 3}
                        y={y - 1}
                        width={6}
                        height={18}
                        rx={3}
                        fill="rgba(15,23,42,0.2)"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          setDragState({
                            itemId: row.item.itemId,
                            mode: "end",
                            originX: event.clientX,
                            originalStart: range.start,
                            originalEnd: range.end,
                            valueId: row.item.valueId,
                            source: row.item.source,
                          });
                        }}
                        className="cursor-ew-resize"
                      />
                    </g>
                  );
                })}

                {dependencies.map((dep) => {
                  const fromRow = rowByItemId.get(dep.fromItemId);
                  const toRow = rowByItemId.get(dep.toItemId);
                  if (!fromRow || !toRow) return null;

                  const fromRange = tempRanges[fromRow.itemId] ?? { start: fromRow.start, end: fromRow.end };
                  const toRange = tempRanges[toRow.itemId] ?? { start: toRow.start, end: toRow.end };
                  const fromY = (itemY.get(fromRow.itemId) ?? 0) + 18;
                  const toY = (itemY.get(toRow.itemId) ?? 0) + 18;

                  const fromStart = toX(fromRange.start);
                  const fromEnd = toX(fromRange.start) + Math.max(dayWidth, daysBetween(fromRange.start, fromRange.end) * dayWidth);
                  const toStart = toX(toRange.start);
                  const toEnd = toX(toRange.start) + Math.max(dayWidth, daysBetween(toRange.start, toRange.end) * dayWidth);

                  const x1 =
                    dep.dependencyType === "START_TO_START" || dep.dependencyType === "START_TO_FINISH"
                      ? fromStart
                      : fromEnd;
                  const x2 =
                    dep.dependencyType === "FINISH_TO_FINISH" || dep.dependencyType === "START_TO_FINISH"
                      ? toEnd
                      : toStart;

                  const midX = Math.max(x1, x2) + 14;
                  const isCritical = criticalPath.edgeSet.has(`${dep.fromItemId}->${dep.toItemId}`);
                  const stroke = isCritical ? "#dc2626" : "#64748b";

                  return (
                    <path
                      key={`dep-${dep.id}`}
                      d={`M ${x1} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${x2} ${toY}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.5}
                      markerEnd={`url(#${isCritical ? "gantt-arrow-critical" : "gantt-arrow"})`}
                      opacity={0.95}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
