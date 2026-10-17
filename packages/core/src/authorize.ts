export type Source = "ui" | "mcp" | "chat" | "agent" | "job" | "api";
export type Actor = { id: string; kind: "user" | "service" | "agent" | "system"; roles?: string[] };

export type ServiceContext = {
  tenantId: string;
  actor: Actor;
  /** The person an agent or service principal acts for. */
  onBehalfOf?: string;
  source: Source;
};

export type Authorizer = (ctx: ServiceContext, action: string, resource: string, input: unknown) => boolean | Promise<boolean>;

// Deny by default. 002 registers can() here; tests register their own.
let authorizer: Authorizer = () => false;

export const setAuthorizer = (fn: Authorizer) => {
  authorizer = fn;
};
export const authorize: Authorizer = (...args) => authorizer(...args);

export class ForbiddenError extends Error {
  constructor(action: string, resource: string) {
    super(`forbidden: ${action} on ${resource}`);
    this.name = "ForbiddenError";
  }
}

// One way to build a context per entry point, so every path audits the same shape.
export const contextFor = {
  ui: (tenantId: string, user: { id: string; roles?: string[] }): ServiceContext => ({ tenantId, actor: { kind: "user", ...user }, source: "ui" }),
  mcp: (tenantId: string, principal: Actor, onBehalfOf?: string): ServiceContext => ({ tenantId, actor: principal, onBehalfOf, source: "mcp" }),
  job: (tenantId: string, jobName: string, onBehalfOf?: string): ServiceContext => ({ tenantId, actor: { id: `job:${jobName}`, kind: "system" }, onBehalfOf, source: "job" }),
};
