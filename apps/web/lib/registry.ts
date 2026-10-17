import type { ModuleManifest } from "@amax/core";
import type { NavItem } from "@amax/ui";
import { modules } from "../generated/modules";

const GROUPS = ["Work", "People", "Business", "Operations"];

export const installed: ModuleManifest[] = [...modules].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order ?? 50) - (b.order ?? 50));

// A module's root entry, then its optional nav[] entries (041) right after it. Only the root can be
// primary (the mobile bar), as in the mock.
export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", primary: true },
  ...installed.flatMap((m) => [
    { href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group, primary: m.primary },
    ...(m.nav ?? []).map((n) => ({ href: `/${m.id}/${n.path}`, label: n.title, icon: n.icon, group: m.group })),
  ]),
  // 047: the Settings hub; "settings:read" is Admin's alone, so visibleNav shows it only to Admins.
  { href: "/settings", label: "Settings", icon: "gear", group: "Operations" },
];

// Routes match segment by segment; ":name" segments become params.
export function matchRoute(pattern: string, path: string[]): Record<string, string> | null {
  const parts = pattern ? pattern.split("/") : [];
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of parts.entries()) {
    // Next has already decoded each segment (route-matcher decodes catch-all entries); decoding
    // again would turn a literal "%41" into "A" (final review).
    if (part.startsWith(":")) params[part.slice(1)] = path[i];
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
