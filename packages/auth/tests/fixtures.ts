import type { Assignment, Viewer } from "../src/viewer";
import type { Role } from "../src/roles";

export const LK = "11111111-1111-4111-8111-1111111111a1";
export const AU = "11111111-1111-4111-8111-1111111111a2";

export function viewer(userId: string, roles: Role[] | Assignment[], extra: Partial<Viewer> = {}): Viewer {
  const assignments = (roles as (Role | Assignment)[]).map((r) => (typeof r === "string" ? { role: r, legalEntityIds: null, departments: null } : r));
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    userId,
    name: userId,
    email: `${userId}@lumen.test`,
    assignments,
    actualRoles: assignments.map((a) => a.role),
    managedProjects: [],
    assignedProjects: [],
    reports: [],
    ...extra,
  };
}
