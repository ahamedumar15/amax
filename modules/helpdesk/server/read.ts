import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";
import { QUEUES, type QueueKey } from "../contracts";

export const READ = "helpdesk:read";
export const CREATE = "helpdesk:ticket:create";
export const MANAGE = "helpdesk:manage";
export const APPROVE = "helpdesk:access:approve";
export const TRIAGE = "helpdesk:triage";
export const queuePerm = (q: QueueKey) => `helpdesk:queue:${q}`;

/** The queues a viewer works in. HR's is only for holders of helpdesk:queue:hr (HR, and Admin). */
export const queuesOf = (v: Viewer): QueueKey[] => QUEUES.filter((q) => can(v, queuePerm(q)));

/** A service may touch a queue's tickets when no person acts (a job), or the person works in it. */
export function inQueue(ctx: ServiceContext, q: QueueKey) {
  const v = viewerOf(ctx);
  return !v || can(v, queuePerm(q));
}

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, READ)) throw new ForbiddenError(READ, "helpdesk");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
/** Who did it, as written on the record: the person, or the agent or job and who it acts for. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
/** The person's user id ("user:<id>" on the context), whether they act or an agent acts for them. */
export const personOf = (ctx: ServiceContext) => {
  const p = ctx.onBehalfOf ?? (ctx.actor.kind === "user" ? ctx.actor.id : null);
  return p?.startsWith("user:") ? p.slice(5) : null;
};

/** "Now" for the tenant: its helpdesk.clock_pin (the demo's), else the real time. */
export async function clockOf(tx: Tx): Promise<Date> {
  const [r] = await tx.execute(sql`select now_at from helpdesk.clock_pin`);
  return r ? new Date(r.now_at as string) : new Date();
}

export const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());
