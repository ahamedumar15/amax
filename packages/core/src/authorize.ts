export type Source = "ui" | "mcp" | "chat" | "agent" | "job" | "api";
export type Actor = { id: string; kind: "user" | "service" | "agent" | "system"; roles?: string[] };

export type ServiceContext = {
  tenantId: string;
  actor: Actor;
  /** The person an agent or service principal acts for. */
  onBehalfOf?: string;
  source: Source;
  /** The signed-in viewer (roles, data scopes) as resolved by @amax/auth; opaque to core. */
  viewer?: unknown;
};

/** `scoped`: the service checks the record's data scope itself after loading it (assertCan), so the
 * up-front check may accept qualified grants (@managed, @assigned, @own). Unscoped services get the
 * strict check. */
export type Authorizer = (ctx: ServiceContext, action: string, resource: string, input: unknown, opts?: { scoped?: boolean }) => boolean | Promise<boolean>;

// Deny by default. 002 registers can() here; tests register their own.
let authorizer: Authorizer = () => false;

export const setAuthorizer = (fn: Authorizer) => {
  authorizer = fn;
};
export const authorize: Authorizer = (...args) => authorizer(...args);

export class ForbiddenError extends Error {
  readonly retryable = false;
  constructor(action: string, resource: string) {
    super(`forbidden: ${action} on ${resource}`);
    this.name = "ForbiddenError";
  }
}

// One way to build a context per entry point, so every path audits the same shape.
export const contextFor = {
  ui: (tenantId: string, user: { id: string; roles?: string[] }): ServiceContext => ({ tenantId, actor: { kind: "user", ...user }, source: "ui" }),
  mcp: (tenantId: string, principal: Actor, onBehalfOf?: string): ServiceContext => ({ tenantId, actor: principal, onBehalfOf, source: "mcp" }),
  job: (tenantId: string, jobName: string, onBehalfOf?: string): ServiceContext => {
    // Frozen, so the tenant, actor and on-behalf-of it was issued with are the ones it keeps.
    const ctx: ServiceContext = Object.freeze({ tenantId, actor: Object.freeze({ id: `job:${jobName}`, kind: "system" as const }), onBehalfOf, source: "job" as const });
    issued.add(ctx);
    return ctx;
  },
};

// System contexts core itself issued. A plain object with `actor.kind: "system"` can be written by any
// caller; only one from contextFor.job is in here, and it can't be added from outside this file.
const issued = new WeakSet<ServiceContext>();

/** True only for a context core issued for trusted system code (contextFor.job), never a hand-built literal. */
export const isSystemContext = (ctx: ServiceContext) => ctx.actor.kind === "system" && issued.has(ctx);
