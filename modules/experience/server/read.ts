import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, isSystemContext, type ServiceContext, type Source } from "@amax/core/server";

export const READ = "experience:read";
export const ADMIN = "experience:admin";
export const FIX = "experience:fix";
export const PULSE = "experience:pulse:send";
export const ANSWER = "experience:pulse:answer";
export const OWN = "experience:own";
export const COLLECT = "experience:collect";

export type Reader = Viewer | ServiceContext;
const isCtx = (r: Reader): r is ServiceContext => "actor" in r;

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, READ)) throw new ForbiddenError(READ, "experience");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
/** Who did it, as written on the record: the person, or the agent or job and who it acts for. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** The person's user id, whether they act or an agent acts for them. */
export const personOf = (ctx: ServiceContext) => {
  const p = ctx.onBehalfOf ?? (ctx.actor.kind === "user" ? ctx.actor.id : null);
  return p ? p.replace(/^user:/, "") : null;
};

export const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);

/** The legal entities a reader sees experience in: all for a job, else those its experience:read reaches. */
export async function entitiesOf(tx: Tx, r: Reader): Promise<{ id: string; name: string; country: string }[]> {
  const rows = (await tx.execute(sql`select id, name, country from core.legal_entity order by country desc, name`)).map((e) => ({ id: e.id as string, name: e.name as string, country: e.country as string }));
  if (isCtx(r)) return isSystemContext(r) ? rows : [];
  return rows.filter((e) => can(r, READ, { legalEntityId: e.id }));
}

/** "Today" for the tenant: experience.settings.today (the demo's pinned day), else the real date. */
export async function todayOf(tx: Tx): Promise<string> {
  const [r] = await tx.execute(sql`select today from experience.settings`);
  return r?.today ? day(r.today) : new Date().toISOString().slice(0, 10);
}

export const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const uuids = (ids: string[]) => `{${ids.join(",")}}`;
