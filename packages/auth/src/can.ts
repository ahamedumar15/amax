import type { ModuleManifest } from "@amax/core";
import { setAuthorizer, type ServiceContext } from "@amax/core/server";
import type { Role } from "./roles";
import type { Assignment, Viewer } from "./viewer";

/** What a check knows about the record: all optional; a missing field doesn't narrow. */
export type ResourceAttrs = {
  legalEntityId?: string | null;
  department?: string | null;
  projectId?: string | null;
  ownerUserId?: string | null;
};

type Grants = Map<Role, string[]>;
let grants: Grants = new Map();

// Built from installed manifests at boot (and in tests).
export function setGrants(modules: Pick<ModuleManifest, "grants">[]) {
  const next: Grants = new Map();
  for (const m of modules) {
    for (const [role, perms] of Object.entries(m.grants ?? {}) as [Role, string[]][]) next.set(role, [...(next.get(role) ?? []), ...perms]);
  }
  grants = next;
}

const matches = (grant: string, action: string) => {
  const [perm] = grant.split("@");
  return perm === action || (perm.endsWith(":*") && action.startsWith(perm.slice(0, -1)));
};

const inScope = (a: Assignment, r: ResourceAttrs) =>
  (a.legalEntityIds === null || !r.legalEntityId || a.legalEntityIds.includes(r.legalEntityId)) &&
  (a.departments === null || !r.department || a.departments.includes(r.department));

function qualifierHolds(q: string | undefined, v: Viewer, r: ResourceAttrs) {
  switch (q) {
    case undefined: return true;
    case "managed": return !!r.projectId && v.managedProjects.includes(r.projectId);
    case "assigned": return !!r.projectId && (v.managedProjects.includes(r.projectId) || v.assignedProjects.includes(r.projectId));
    case "own": return !!r.ownerUserId && r.ownerUserId === v.userId;
    default: return false;
  }
}

// The one permission check. Modules call it; they never test roles themselves.
export function can(v: Viewer, action: string, resource: ResourceAttrs = {}): boolean {
  return v.assignments.some((a) => {
    if (!inScope(a, resource)) return false;
    if (a.role === "Admin") return true;
    return (grants.get(a.role) ?? []).some((g) => matches(g, action) && qualifierHolds(g.split("@")[1], v, resource));
  });
}

export class ScopeError extends Error {
  constructor(action: string) {
    super(`forbidden: ${action} is outside your data scope`);
    this.name = "ScopeError";
  }
}

export function assertCan(v: Viewer, action: string, resource?: ResourceAttrs) {
  if (!can(v, action, resource)) throw new ScopeError(action);
}

export const viewerOf = (ctx: ServiceContext) => ctx.viewer as Viewer | undefined;

// Services check the permission up front (no record yet); they call assertCan() again once they
// have loaded the record, so data scopes apply. System jobs are trusted code.
export function installAuthorizer() {
  setAuthorizer((ctx, action) => {
    if (ctx.actor.kind === "system") return true;
    // principalContext() has already checked scopes, expiry and acts-for (and audited refusals).
    if (ctx.actor.kind === "service") return Boolean((ctx as { principal?: unknown }).principal);
    const v = viewerOf(ctx);
    return !!v && can(v, action);
  });
}
