import { can, rolesOf, type Viewer } from "@amax/auth";
import type { NavItem } from "@amax/ui";
import type { Profile } from "../components/shell/ProfileMenu";

const ORDER = ["Admin", "Leadership", "PM", "HR", "Payroll", "Finance", "Sales", "Engineer", "Employee"];

export function profileOf(v: Viewer): Profile {
  const primary = [...v.actualRoles].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? "Employee";
  return {
    name: v.name,
    initials: v.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    chip: v.viewAs ?? primary,
    subtitle: v.actualRoles.join(" · "),
    canViewAs: v.actualRoles.includes("Admin"),
    isAdmin: rolesOf(v).includes("Admin"),
    viewAs: v.viewAs,
  };
}

// The mock's wording: what a preview hides.
export function viewBanner(v: Viewer): string | null {
  if (!v.viewAs || v.viewAs === "Admin") return null;
  return v.viewAs === "Payroll" ? "Viewing as Payroll: screens outside payroll are hidden." : `Viewing as ${v.viewAs}: pay, payroll and admin screens are hidden.`;
}

// Overview stays; each module's nav entry needs "<id>:read" for one of the effective roles.
export const visibleNav = (items: NavItem[], v: Viewer) => items.filter((i) => i.href === "/" || can(v, `${i.href.split("/")[1]}:read`));

export const hasAnyRole = (v: Viewer) => rolesOf(v).length > 0;
