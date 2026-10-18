import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const READ = "career:read";
export const TAG = "career:tag";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, READ)) throw new ForbiddenError(READ, "career");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Who did it, as written on the record: the person, or the agent or job and who it acts for. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);

export const asDay = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
export const asTime = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** The tenant's "today": its pinned day (the demo's Oct 16), else the real date in UTC. */
export async function todayOf(tx: Tx): Promise<string> {
  const [s] = await tx.execute(sql`select today from career.settings`);
  return s?.today ? asDay(s.today) : new Date().toISOString().slice(0, 10);
}

/** A stable UUID for an event read live from another module, so a pin on it resolves again. */
export const eventId = (key: string) => {
  const h = createHash("sha1").update(`career:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
