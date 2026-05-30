/**
 * Board Views SDK — Plugin system for custom board views
 *
 * Allows registering custom views that appear alongside built-in views
 * (Table, Kanban, Calendar, Timeline, Gantt, Sprints).
 *
 * Usage:
 *   import { registerView } from '@/lib/view-sdk';
 *   registerView({
 *     id: 'my-custom-view',
 *     name: 'My View',
 *     icon: '🎨',
 *     description: 'A custom board view',
 *     component: MyCustomView,
 *   });
 */

import { ComponentType, lazy } from "react";

export interface BoardViewConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: ComponentType<BoardViewProps>;
}

export interface BoardViewProps {
  boardId: string;
  groups: any[];
  columns: any[];
  onUpdateValue: (valueId: string, value: unknown) => void;
  onSelectItem?: (itemId: string) => void;
}

type ViewListener = () => void;

const views = new Map<string, BoardViewConfig>();
const listeners = new Set<ViewListener>();

// Register built-in views
const builtinViews: BoardViewConfig[] = [
  { id: 'TABLE', name: 'Table', icon: '📊', description: 'Spreadsheet-like table view', component: null as any },
  { id: 'KANBAN', name: 'Kanban', icon: '📋', description: 'Drag-and-drop Kanban board', component: null as any },
  { id: 'CALENDAR', name: 'Calendar', icon: '📅', description: 'Calendar view with dates', component: null as any },
  { id: 'TIMELINE', name: 'Timeline', icon: '📅', description: 'Horizontal timeline view', component: null as any },
  { id: 'GANTT', name: 'Gantt', icon: '🗂️', description: 'Gantt chart with dependencies', component: null as any },
  { id: 'SPRINTS', name: 'Sprints', icon: '🏃', description: 'Sprint planning and tracking', component: null as any },
];

// Register built-in views
for (const view of builtinViews) {
  views.set(view.id, view);
}

export function registerView(config: BoardViewConfig): void {
  if (views.has(config.id) && builtinViews.some(v => v.id === config.id)) {
    throw new Error(`Cannot override built-in view: ${config.id}`);
  }
  views.set(config.id, config);
  listeners.forEach(fn => fn());
}

export function unregisterView(id: string): void {
  if (builtinViews.some(v => v.id === id)) {
    throw new Error(`Cannot unregister built-in view: ${id}`);
  }
  views.delete(id);
  listeners.forEach(fn => fn());
}

export function getView(id: string): BoardViewConfig | undefined {
  return views.get(id);
}

export function getAllViews(): BoardViewConfig[] {
  return Array.from(views.values());
}

export function getBuiltinViews(): BoardViewConfig[] {
  return [...builtinViews];
}

export function getCustomViews(): BoardViewConfig[] {
  return Array.from(views.values()).filter(v => !builtinViews.some(b => b.id === v.id));
}

export function onViewsChange(listener: ViewListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isBuiltinView(id: string): boolean {
  return builtinViews.some(v => v.id === id);
}
