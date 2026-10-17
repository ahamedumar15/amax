import type { Role } from "./roles";

// One role assignment with its data scope. null = every entity / department.
export type Assignment = { role: Role; legalEntityIds: string[] | null; departments: string[] | null };

export type Viewer = {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  /** Effective assignments: the real ones, or the View-as role for an Admin previewing. */
  assignments: Assignment[];
  /** Always the real roles, so the shell can offer View as and audit names the real user. */
  actualRoles: Role[];
  viewAs?: Role;
  sessionId?: string;
  /** Project and reporting scopes, filled by modules that own them (007 projects, 011 managers). */
  managedProjects: string[];
  assignedProjects: string[];
  reports: string[];
};

export const rolesOf = (v: Viewer) => [...new Set(v.assignments.map((a) => a.role))];

// Admins preview a role with that role's grants but no narrower data scope than they have.
export function applyViewAs(v: Viewer, role: Role | undefined): Viewer {
  if (!role || !v.actualRoles.includes("Admin")) return { ...v, viewAs: undefined };
  return { ...v, viewAs: role, assignments: [{ role, legalEntityIds: null, departments: null }] };
}

// Server actions in modules need the signed-in viewer without importing the app; the app registers
// how to resolve it (from the Auth.js session) once at startup.
let resolver: (() => Promise<Viewer | null>) | undefined;
export const setViewerResolver = (fn: () => Promise<Viewer | null>) => {
  resolver = fn;
};
export async function currentViewer(): Promise<Viewer> {
  const v = resolver ? await resolver() : null;
  if (!v) throw new Error("not signed in");
  return v;
}
