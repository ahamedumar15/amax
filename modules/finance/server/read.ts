import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { assertCan, can, canEver, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, "finance:read")) throw new ForbiddenError("finance:read", "finance");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const sees = (v: Viewer, legalEntityId: string) => can(v, "finance:read", { legalEntityId });

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export function mayAct(ctx: ServiceContext, action: string, legalEntityId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { legalEntityId });
}

export const amt = (v: unknown) => (Number.isFinite(Number(v)) ? String(v ?? "0").replace(/^(-?\d+)(?:\.(\d{0,2})\d*)?$/, (_m, w: string, f = "") => `${w}.${f.padEnd(2, "0")}`) : "0.00");
export const dayOf = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function todayOf(tx: Tx): Promise<string> {
  const [s] = await tx.execute(sql`select coalesce((select today from finance.settings), current_date)::text as today`);
  return String(s.today);
}

export const monthLabel = (month: string, style: "long" | "short" = "long") =>
  new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });
export const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
