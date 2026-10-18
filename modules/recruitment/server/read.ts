import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, canSee, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

/**
 * 023 AC-1, 002: what a viewer may see of the pipeline in a legal entity.
 * - "candidate": names, contact details, CVs and the agent's evidence. HR (002's `candidate` class).
 * - "pipeline": roles, stages, counts, dates and scores, with every candidate field masked. Admin, Leadership.
 * - null: nothing; the screen is a 404 and the tools refuse.
 */
export type Level = "candidate" | "pipeline";
export function levelOf(v: Viewer, legalEntityId: string): Level | null {
  if (!can(v, "recruitment:read", { legalEntityId })) return null;
  return canSee(v, "candidate", { legalEntityId }) ? "candidate" : "pipeline";
}

/** Runs a read in the viewer's tenant, once they could read some of the pipeline at all. */
export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, "recruitment:read")) throw new ForbiddenError("recruitment:read", "recruitment");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const dayOf = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

/** The calendar quarter holding `now`: its first day, and the quarter before's. */
export function quarterOf(now = new Date()) {
  const q = Math.floor(now.getUTCMonth() / 3);
  const start = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
  const prev = new Date(Date.UTC(now.getUTCFullYear(), q * 3 - 3, 1));
  return { start: start.toISOString(), prev: prev.toISOString(), label: `Q${q + 1}`, prevLabel: `Q${((q + 3) % 4) + 1}` };
}

/** One application, locked, with its role and candidate, for a write. */
export async function lockApplication(tx: Tx, applicationId: string) {
  const [a] = await tx.execute(sql`select a.*, r.title as role_title, r.department, r.status as role_status, c.name, c.email
    from recruitment.application a join recruitment.role r on r.id = a.role_id join recruitment.candidate c on c.id = a.candidate_id
    where a.id = ${applicationId} for update of a`);
  if (!a) throw new Error("no such application");
  return a;
}
