import { ComponentType } from "react";

export interface BoardViewRegistration {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: ComponentType<any>;
  defaultConfig?: Record<string, unknown>;
}

const viewRegistry = new Map<string, BoardViewRegistration>();

export function registerView(registration: BoardViewRegistration) {
  viewRegistry.set(registration.id, registration);
}

export function getView(id: string): BoardViewRegistration | undefined {
  return viewRegistry.get(id);
}

export function getAllViews(): BoardViewRegistration[] {
  return Array.from(viewRegistry.values());
}

export function unregisterView(id: string) {
  viewRegistry.delete(id);
}
