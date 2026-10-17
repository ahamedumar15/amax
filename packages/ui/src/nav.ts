import type { ComponentType, ReactNode } from "react";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; group?: string; primary?: boolean };

export type LinkLike = ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>;

export function groupItems(items: NavItem[]) {
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}
