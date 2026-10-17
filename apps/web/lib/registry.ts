import type { ModuleManifest } from "@amax/core";
import type { NavItem } from "@amax/ui";
import { modules } from "../generated/modules";

const GROUPS = ["Work", "People", "Business", "Operations"];

export const installed: ModuleManifest[] = [...modules].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order ?? 50) - (b.order ?? 50));

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", primary: true },
  ...installed.map((m) => ({ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group, primary: m.primary })),
];

// Routes match segment by segment; ":name" segments become params.
export function matchRoute(pattern: string, path: string[]): Record<string, string> | null {
  const parts = pattern ? pattern.split("/") : [];
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of parts.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(path[i]);
    else if (part !== path[i]) return null;
  }
  return params;
}

export function findRoute(id: string, path: string[] = []) {
  const mod = installed.find((m) => m.id === id);
  for (const route of mod?.routes ?? []) {
    const params = matchRoute(route.path, path);
    if (params) return { mod: mod!, route, params };
  }
  return null;
}
