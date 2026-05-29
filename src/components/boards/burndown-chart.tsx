"use client";

import { useMemo } from "react";

interface BurndownChartProps {
  sprintId: string;
  sprintName: string;
  startDate: string | Date;
  endDate: string | Date;
  sprintItems: Array<{
    storyPoints: number | null;
    burnedPoints: number;
    completedAt: string | Date | null;
  }>;
}

export function BurndownChart({ sprintName, startDate, endDate, sprintItems }: BurndownChartProps) {
  const chartData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Reset time portion for day counting
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const totalPoints = sprintItems.reduce(
      (acc, si) => acc + (si.storyPoints ?? 0),
      0
    );

    // Ideal burndown: straight line from totalPoints to 0
    const ideal: Array<{ day: number; points: number }> = [];
    for (let d = 0; d <= totalDays; d++) {
      const fraction = totalDays === 0 ? 1 : d / totalDays;
      ideal.push({
        day: d,
        points: totalPoints === 0 ? 0 : Math.max(0, totalPoints * (1 - fraction)),
      });
    }

    // Actual burndown: track completed items by day
    const actual: Array<{ day: number; points: number }> = [];
    let remainingPoints = totalPoints;

    // Day 0: start point
    actual.push({ day: 0, points: totalPoints });

    // Group completions by day
    const completionsByDay = new Map<number, number>();
    for (const si of sprintItems) {
      if (si.completedAt && (si.storyPoints ?? 0) > 0) {
        const completedDay = new Date(si.completedAt);
        completedDay.setHours(0, 0, 0, 0);
        const dayNum = Math.round((completedDay.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const clampedDay = Math.max(0, Math.min(totalDays, dayNum));
        completionsByDay.set(
          clampedDay,
          (completionsByDay.get(clampedDay) ?? 0) + (si.storyPoints ?? 0)
        );
      }
    }

    for (let d = 1; d <= totalDays; d++) {
      const burnedToday = completionsByDay.get(d) ?? 0;
      remainingPoints = Math.max(0, remainingPoints - burnedToday);
      actual.push({ day: d, points: remainingPoints });
    }

    return { ideal, actual, totalPoints, totalDays };
  }, [startDate, endDate, sprintItems]);

  // SVG dimensions
  const width = 500;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(chartData.totalPoints, 1);

  const toX = (day: number) =>
    padding.left + (chartData.totalDays === 0 ? 0 : (day / chartData.totalDays) * chartW);
  const toY = (val: number) =>
    padding.top + chartH - (val / maxVal) * chartH;

  const idealPath = chartData.ideal
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.day)} ${toY(p.points)}`)
    .join(" ");

  const actualPath = chartData.actual
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.day)} ${toY(p.points)}`)
    .join(" ");

  // Build fill path for area under actual line
  const actualFillPath =
    actualPath +
    ` L ${toX(chartData.actual[chartData.actual.length - 1]?.day ?? 0)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`;

  const currentRemaining = chartData.actual[chartData.actual.length - 1]?.points ?? chartData.totalPoints;

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold">Burndown Chart</h4>
        <span className="text-[10px] text-muted-foreground">{sprintName}</span>
      </div>

      {chartData.totalPoints === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No story points in this sprint.
        </p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = toY(maxVal * frac);
            return (
              <g key={frac}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
                <text x={padding.left - 5} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
                  {Math.round(maxVal * frac)}
                </text>
              </g>
            );
          })}

          {/* Day labels */}
          {Array.from({ length: Math.min(chartData.totalDays + 1, 15) }, (_, i) => {
            const day = Math.round((i / Math.min(chartData.totalDays, 14)) * chartData.totalDays);
            const x = toX(day);
            return (
              <text key={day} x={x} y={height - 5} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
                D{day}
              </text>
            );
          })}

          {/* Ideal line */}
          <path d={idealPath} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" />

          {/* Actual fill */}
          <path d={actualFillPath} fill="rgba(87, 155, 252, 0.1)" />

          {/* Actual line */}
          <path d={actualPath} fill="none" stroke="#579bfc" strokeWidth={2} />

          {/* Data points */}
          {chartData.actual.map((p, i) => (
            <circle key={i} cx={toX(p.day)} cy={toY(p.points)} r={2.5} fill="#579bfc" />
          ))}

          {/* Legend */}
          <g transform={`translate(${width - padding.right - 80}, ${padding.top})`}>
            <line x1={0} y1={0} x2={12} y2={0} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={16} y={3} fontSize={8} className="fill-muted-foreground">Ideal</text>
            <line x1={45} y1={0} x2={57} y2={0} stroke="#579bfc" strokeWidth={2} />
            <text x={61} y={3} fontSize={8} className="fill-muted-foreground">Actual</text>
          </g>
        </svg>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Total: <strong className="text-foreground">{chartData.totalPoints}</strong> pts
        </span>
        <span>
          Remaining: <strong className="text-foreground">{currentRemaining}</strong> pts
        </span>
        <span>
          Days: <strong className="text-foreground">{chartData.totalDays}</strong>
        </span>
      </div>
    </div>
  );
}
