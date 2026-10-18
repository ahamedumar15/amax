import type { ComponentType, ReactNode } from "react";
import type { IconName } from "./icons";

/**
 * `permission`: the read permission that shows the item, when it isn't the href's first segment's (034).
 * `hub`: shown when the viewer may open any screen behind it (038's Settings), decided by the app.
 */
export type NavItem = { href: string; label: string; icon: IconName; group?: string; primary?: boolean; permission?: string; hub?: boolean };

export type LinkLike = ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>;

export function groupItems(items: NavItem[]) {
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}
