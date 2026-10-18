import type { ModuleManifest } from "@amax/core";
import type { NavItem } from "@amax/ui";
import { modules } from "../generated/modules";
import { OPERATIONS } from "./operations";

const GROUPS = ["Work", "People", "Business", "Operations"];

export const installed: ModuleManifest[] = [...modules].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order ?? 50) - (b.order ?? 50));

// A module's root entry, then its optional nav[] entries (041) right after it. Only the root can be
// primary (the mobile bar), as in the mock.
export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", primary: true },
  // 006: every agent suggestion a person may decide; "suggestions:read" is granted to every role.
  { href: "/suggestions", label: "Suggestions", icon: "spark" },
  ...installed.flatMap((m) => [
    ...(m.menu === "profile" ? [] : [{ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group, primary: m.primary }]),
    ...(m.nav ?? []).map((n) => ({ href: `/${m.id}/${n.path}`, label: n.title, icon: n.icon, group: m.group })),
  ]),
  // 047, 055: the Operations group: the Settings hub ("settings:read") and the screens still to come
  // ("operations:read"). Admin and IT Admin hold both, so visibleNav shows the group only to them.
  { href: "/settings", label: "Settings", icon: "gear", group: "Operations" },
  // A screen that has shipped as a module (036's Compliance) replaces its "Coming soon" entry; switching the module off brings it back.
  ...OPERATIONS.filter((o) => !installed.some((m) => m.id === o.slug)).map((o) => ({ href: `/operations/${o.slug}`, label: o.title, icon: o.icon, group: "Operations" })),
  // 034: Admin only (the export holds pay and money, which IT Admin never sees).
  { href: "/settings/backups", label: "Backups and export", icon: "grid", group: "Operations", permission: "backup:read" },
];

// Module screens reached from the profile menu instead of the rail (030's Notifications).
export const menuItems: NavItem[] = installed.filter((m) => m.menu === "profile").map((m) => ({ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group }));

// Controls modules add to the top bar (030's bell).
export const topBarControls = installed.flatMap((m) => (m.topBar ? [{ id: m.id, Control: m.topBar }] : []));

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

// Routes other modules mount under `id` (051) come first, so they replace the owner's fallback.
export function routeIn(mods: ModuleManifest[], id: string, path: string[] = []) {
  const mod = mods.find((m) => m.id === id);
  if (!mod) return null;
  const mounted = mods.flatMap((m) => m.routes.filter((r) => r.mount === id));
  for (const route of [...mounted, ...mod.routes.filter((r) => !r.mount)]) {
    const params = matchRoute(route.path, path);
    if (params) return { mod, route, params };
  }
  return null;
}

export const findRoute = (id: string, path: string[] = []) => routeIn(installed, id, path);
