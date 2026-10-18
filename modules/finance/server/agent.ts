import type { Viewer } from "@amax/auth";

export const BILLING_AGENT = "Billing agent";

export const billingReader = (tenantId: string): Viewer => ({
  tenantId, userId: "00000000-0000-4000-8000-000000000017", name: BILLING_AGENT, email: "", assignments: [{ role: "Finance", legalEntityIds: null, departments: null }],
  actualRoles: ["Finance"], managedProjects: [], assignedProjects: [], reports: [],
});
