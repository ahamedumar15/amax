import { withTenant, type Tx } from "@amax/db";
import { assertCan, canEver, canSeePricing, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const READ = "it-access:read";
export const APPROVE = "it-access:change:approve";
export const REQUEST = "it-access:change:request";
export const REVIEW = "it-access:review";
export const CONSENT = "it-access:write:consent";

/** Runs a read in the viewer's tenant once they hold it-access:read (IT Admin, Admin). */
export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, READ)) throw new ForbiddenError(READ, "it-access");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
/** Who did it, as written on the record: the person, or the agent or job and who it acts for. */
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** The viewer acting (if any) must hold the write's permission. */
export function mayAct(ctx: ServiceContext, action: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, {});
}

/** 055: licence prices are the `pricing` class. Without it, every money field is left out, never nulled. */
const MONEY = new Set(["monthlyUsd", "seatUsd", "unusedUsd", "savingsUsd", "spendUsd", "yearlyUsd"]);
export function priced<T>(v: Viewer, value: T): T {
  if (canSeePricing(v)) return value;
  const strip = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(strip);
    if (x === null || typeof x !== "object") return x;
    return Object.fromEntries(Object.entries(x).filter(([k]) => !MONEY.has(k)).map(([k, y]) => [k, strip(y)]));
  };
  return strip(value) as T;
}

export const day = (v: unknown) => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number, from = new Date()) => new Date(from.getTime() - n * 86_400_000).toISOString().slice(0, 10);
export const initialsOf = (name: string) => name.trim().split(/[\s,]+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
