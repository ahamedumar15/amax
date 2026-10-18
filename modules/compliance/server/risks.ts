import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, RISK_STATUSES, type RiskChanged, type RiskLevel, type RiskRaised } from "../contracts";
import { by, day, isoDate, nextRef, personNamed, selfOf, type Row } from "./context";

const scale = z.number().int().min(1).max(5);

/** Likelihood times impact, each 1 to 5: 15 and over is high, 6 and over medium. */
export const levelOf = (likelihood: number, impact: number): RiskLevel => (likelihood * impact >= 15 ? "high" : likelihood * impact >= 6 ? "medium" : "low");

const ownerOf = async (tx: Tx, ctx: ServiceContext, owner: string | undefined) => (owner && owner.toLowerCase() !== "me" ? personNamed(tx, owner) : selfOf(ctx));
const raised = (r: Row, ctx: ServiceContext): RiskRaised => ({ riskId: r.id as string, ref: r.ref as string, level: r.level as RiskLevel, ownerUserId: (r.owner_user_id as string | null) ?? null, by: by(ctx) });

export const addRisk = defineService({
  name: "compliance.risk.create", action: "compliance:manage", resource: "compliance.risk",
  input: z.object({ title: z.string().min(3), description: z.string().optional(), likelihood: scale, impact: scale, owner: z.string().optional(), treatment: z.string().optional(), reviewOn: isoDate.optional() }),
  async run(tx, a, ctx) {
    const owner = await ownerOf(tx, ctx, a.owner);
    const [r] = await tx.execute(sql`insert into compliance.risk (tenant_id, ref, title, description, likelihood, impact, level, owner_user_id, owner_name, treatment, review_on, raised_by)
      values (${ctx.tenantId}, ${await nextRef(tx, "risk", "R")}, ${a.title}, ${a.description ?? null}, ${a.likelihood}, ${a.impact}, ${levelOf(a.likelihood, a.impact)},
        ${owner?.userId ?? null}, ${owner?.name ?? null}, ${a.treatment ?? null}, ${a.reviewOn ?? null}, ${by(ctx)}) returning *`);
    return { result: { id: r.id as string, ref: r.ref as string, title: a.title, level: r.level as string, owner: owner?.name ?? null }, resourceId: r.id as string,
      after: { ref: r.ref, level: r.level, likelihood: a.likelihood, impact: a.impact }, events: [{ name: EVENTS.riskRaised, payload: raised(r, ctx) }] };
  },
});

export const updateRisk = defineService({
  name: "compliance.risk.update", action: "compliance:manage", resource: "compliance.risk",
  input: z.object({ riskId: z.string().uuid(), likelihood: scale.optional(), impact: scale.optional(), status: z.enum(RISK_STATUSES).optional(), owner: z.string().optional(), treatment: z.string().optional(), reviewOn: isoDate.optional() }),
  async run(tx, a, ctx) {
    const [was] = await tx.execute(sql`select * from compliance.risk where id = ${a.riskId} for update`);
    if (!was) throw new Error("no such risk");
    const [l, i] = [a.likelihood ?? Number(was.likelihood), a.impact ?? Number(was.impact)];
    const owner = a.owner ? await ownerOf(tx, ctx, a.owner) : null;
    const status = a.status ?? (was.status as string);
    const [r] = await tx.execute(sql`update compliance.risk set likelihood = ${l}, impact = ${i}, level = ${levelOf(l, i)}, status = ${status},
      owner_user_id = ${owner ? owner.userId : was.owner_user_id}, owner_name = ${owner ? owner.name : was.owner_name}, treatment = ${a.treatment ?? was.treatment},
      review_on = ${a.reviewOn ?? day(was.review_on)}, closed_at = ${status === "closed" ? sql`coalesce(closed_at, now())` : null}, updated_at = now() where id = ${a.riskId} returning *`);
    const changed = Object.keys(a).filter((k) => k !== "riskId");
    const payload: RiskChanged = { ...raised(r, ctx), status, changed };
    return { result: { id: r.id as string, ref: r.ref as string, title: r.title as string, level: r.level as string, status }, resourceId: a.riskId,
      before: { level: was.level, status: was.status }, after: { level: r.level, status }, events: [{ name: EVENTS.riskChanged, payload }] };
  },
});
