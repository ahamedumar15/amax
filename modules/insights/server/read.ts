import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const READ = "insights:read";
export const ADMIN = "insights:admin";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, READ)) throw new ForbiddenError(READ, "insights");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Who did it, as written on the record: the person, or the agent or job and who it acts for. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);

export const asDay = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** The tenant's "today" (its pinned day, the demo's Oct 16, else the real date in UTC) and who the briefing is written for. */
export async function settingsOf(tx: Tx): Promise<{ today: string; briefingFor: string | null }> {
  const [s] = await tx.execute(sql`select today, briefing_for from insights.settings`);
  return { today: s?.today ? asDay(s.today) : new Date().toISOString().slice(0, 10), briefingFor: (s?.briefing_for as string | null) ?? null };
}
