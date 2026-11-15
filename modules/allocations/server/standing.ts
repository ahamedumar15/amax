import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError } from "@amax/auth";
import { contextFor, defineService, isSystemContext } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { monthOf } from "../contracts";

export const HORIZON = 12;
export const addMonths = (month: string, n: number) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const ahead = (from: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(from, i));

type Slot = { personId: string; projectId: string; month: string; percent: number; by: string; tenantId: string };

/**
 * Sets or ends a person's standing allocation on a project from `month`. Any open one is ended there (kept for the months
 * before); percent 0 removes every month row from then on. Otherwise the new one writes its months HORIZON ahead.
 */
export async function setStanding(tx: Tx, s: Slot): Promise<string[]> {
  const slot = sql`person_id = ${s.personId} and project_id = ${s.projectId}`;
  await tx.execute(sql`update allocations.standing set until_month = ${s.month}, updated_by = ${s.by}, updated_at = now() where ${slot} and until_month is null and from_month < ${s.month}`);
  await tx.execute(sql`delete from allocations.standing where ${slot} and until_month is null and from_month >= ${s.month}`);
  if (s.percent === 0) {
    await tx.execute(sql`delete from allocations.allocation where ${slot} and month >= ${s.month}::date`);
    return [];
  }
  const months = ahead(s.month, HORIZON);
  await tx.execute(sql`delete from allocations.allocation where ${slot} and month between ${months[0]}::date and ${months[months.length - 1]}::date`);
  for (const m of months) {
    await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by) values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${m}, ${s.percent}, ${s.by})`);
  }
  await tx.execute(sql`insert into allocations.standing (tenant_id, person_id, project_id, percent, from_month, filled_to, updated_by)
    values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${s.percent}, ${s.month}, ${months[months.length - 1]}, ${s.by})`);
  return months;
}

const open = (tx: Tx, where = sql`true`) => tx.execute(sql`select person_id, project_id from allocations.standing where until_month is null and ${where}`);

/** The people standing on a project now: their team rows read "until further notice". */
export const standingOn = async (tx: Tx, projectId: string) => new Set((await open(tx, sql`project_id = ${projectId}`)).map((r) => r.person_id as string));

/** Every open standing slot as "personId:projectId", for the grid's mark. */
export const standingSlots = async (tx: Tx) => new Set((await open(tx)).map((r) => `${r.person_id}:${r.project_id}`));

/** The monthly job's write: each open standing allocation is written up to HORIZON months from `today`. A month a person set by hand wins. */
export const extendStanding = defineService({
  name: "allocations.standing.extend",
  action: "allocations:allocate",
  resource: "allocations.standing",
  input: z.object({ today: z.string() }),
  async run(tx, input, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("allocations:allocate");
    const target = addMonths(monthOf(input.today), HORIZON - 1);
    let written = 0;
    for (const s of await tx.execute(sql`select * from allocations.standing where until_month is null and filled_to < ${target}::date`)) {
      const from = addMonths(String(s.filled_to).slice(0, 10), 1);
      for (let m = from; m <= target; m = addMonths(m, 1)) {
        const [row] = await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by)
          values (${ctx.tenantId}, ${s.person_id}, ${s.project_id}, ${m}, ${s.percent}, ${"allocations.standing"}) on conflict do nothing returning id`);
        if (row) written++;
      }
      await tx.execute(sql`update allocations.standing set filled_to = ${target} where id = ${s.id}`);
    }
    return { result: { written }, resourceId: null, after: { through: target, written } };
  },
});

export const standingExtend = defineWorkflow({
  name: "allocations.standing-extend",
  title: "Until further notice",
  async run(ctx) {
    const n = await step("extend", () => extendStanding(contextFor.job(ctx.tenantId, "allocations.standing-extend"), { today: new Date().toISOString().slice(0, 10) }), { timeout: "2m" });
    return { summary: `${n.written} months written ahead` };
  },
});

export const standingExtendSchedule = cron({ name: "allocations.standing-extend", title: "Until further notice", description: "Writes standing allocations a month further ahead", workflow: "allocations.standing-extend", cron: "0 2 1 * *", enabled: true });
