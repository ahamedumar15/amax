import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { can, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const READ = "compliance:read";
export const MANAGE = "compliance:manage";
export const REPORT = "compliance:report";
export const ACKNOWLEDGE = "compliance:acknowledge";

// A screen or tool acting for the viewer: the person, or a service credential acting for them (058).
export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Who did it, as every record names it: the person, or an agent acting for that person. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>, permission = READ) => {
  if (!can(viewer, permission)) throw new ForbiddenError(permission, "compliance");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export type Row = Record<string, unknown>;

export const day = (v: unknown) => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
export const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** The next register reference, such as INC-007 or R-012. */
export async function nextRef(tx: Tx, table: "risk" | "incident", prefix: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`compliance.${table}.ref`}))`);
  const [r] = await tx.execute(sql`select count(*)::int as n from ${sql.raw(`compliance.${table}`)}`);
  return `${prefix}-${String(Number(r.n) + 1).padStart(3, "0")}`;
}

/** A signed-in person by name or email, for owners: their auth user and name. */
export async function personNamed(tx: Tx, who: string): Promise<{ userId: string; name: string }> {
  const rows = await tx.execute(sql`select id, name from auth.user where status = 'active' and (lower(email) = lower(${who}) or lower(name) = lower(${who}) or id::text = ${who})`);
  if (rows.length !== 1) throw new Error(rows.length ? `more than one person is called ${who}; give their email` : `no one called ${who} can sign in to amax`);
  return { userId: rows[0].id as string, name: rows[0].name as string };
}

/** The signed-in person acting, for "me" as an owner; none for a system job. */
export const selfOf = (ctx: ServiceContext) => {
  const v = viewerOf(ctx);
  return v ? { userId: v.userId, name: v.name } : null;
};

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

/** A legal entity by id, name or country code. */
export async function entityNamed(tx: Tx, entity: string): Promise<{ id: string; country: string }> {
  const [e] = await tx.execute(sql`select id, country from core.legal_entity where id::text = ${entity} or lower(name) = lower(${entity}) or country = upper(${entity}) order by name limit 1`);
  if (!e) throw new Error(`no legal entity called ${entity}`);
  return { id: e.id as string, country: String(e.country) };
}
