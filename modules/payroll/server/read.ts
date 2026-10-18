import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, canSee, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

/**
 * 014 AC-3, 002: what a viewer may see of a run in a legal entity.
 * - "pay": every amount, per person. Payroll and Admin (002's `pay` class).
 * - "totals": totals by entity and cost centre, never one person's pay. Finance.
 * - "status": the run's steps and the changes' explanations, amounts masked. HR, who approves a step.
 * - null: nothing; the screen is a 404 and the tools refuse.
 * A person's own payslip, once sent, is theirs to read whatever their role (`ownPayslip`).
 */
export type Level = "pay" | "totals" | "status";
export function levelOf(v: Viewer, legalEntityId: string): Level | null {
  if (!can(v, "payroll:read", { legalEntityId })) return null;
  if (canSee(v, "pay", { legalEntityId })) return "pay";
  if (can(v, "payroll:totals", { legalEntityId })) return "totals";
  return "status";
}

/** Runs a read in the viewer's tenant, once they could read some run at all. */
export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>, permission = "payroll:read") => {
  if (!canEver(viewer, permission)) throw new ForbiddenError(permission, "payroll");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

/** A screen or tool acting for the viewer: the person, or a service credential acting for them (058). */
export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const today = () => new Date().toISOString().slice(0, 10);
export const dayOf = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
/** A numeric(19,4) as a two-decimal string: "333250.00". */
export const amt = (v: unknown) => (Number.isFinite(Number(v)) ? String(v ?? "0").replace(/^(-?\d+)(?:\.(\d{0,2})\d*)?$/, (_m, w: string, f = "") => `${w}.${f.padEnd(2, "0")}`) : "0.00");

/** "2026-10" → the first and last day, and "October 2026". */
export function periodOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { month, from, to, label: monthLabel(month), short: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) };
}
export const monthLabel = (month: string) => new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

/** Monday to Friday between two days, inclusive. */
export function workingDays(from: string, to: string) {
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

export const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
/** The display name of a "user:<id>" actor (or "user:<id> for <id>"), from the sign-in directory. */
export const named = (col: string) => sql.raw(`(select u.name from auth.user u where 'user:' || u.id::text = split_part(${col}, ' for ', 1))`);
/** Who took a step: their name, "amax" for a job, or the raw actor. */
export const who = (id: unknown, name: unknown) => (id ? ((name as string | null) ?? (String(id).startsWith("job:") ? "amax" : String(id))) : null);
