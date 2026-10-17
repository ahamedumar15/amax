import type { ModuleManifest } from "@amax/core";
import type { NavItem } from "@amax/ui";
import { modules } from "../generated/modules";

const GROUPS = ["Work", "People", "Business", "Operations"];

export const installed: ModuleManifest[] = [...modules].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order ?? 50) - (b.order ?? 50));

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", primary: true },
  ...installed.map((m) => ({ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group, primary: m.primary })),
];

export function findRoute(id: string, path: string[] = []) {
  const mod = installed.find((m) => m.id === id);
  const route = mod?.routes.find((r) => r.path === path.join("/"));
  return mod && route ? { mod, route } : null;
}
