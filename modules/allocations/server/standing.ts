import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError } from "@amax/auth";
import { contextFor, defineService, isSystemContext } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { EVENTS, monthOf, type AllocationSet } from "../contracts";

export const HORIZON = 12;
export const addMonths = (month: string, n: number) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const ahead = (from: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(from, i));
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

type Slot = { personId: string; projectId: string; month: string; percent: number; by: string; tenantId: string };

/** Writes a standing allocation's months that have no row yet: a month set by hand wins. Returns the months written. */
async function fill(tx: Tx, standingId: string, s: Omit<Slot, "month">, months: string[]) {
  const written: string[] = [];
  for (const m of months) {
    const [row] = await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by, standing_id)
      values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${m}, ${s.percent}, ${s.by}, ${standingId}) on conflict do nothing returning id`);
    if (row) written.push(m);
  }
  return written;
}

/**
 * Sets or ends a person's standing allocation on a project from `month`. Any open one is ended there; only the month rows
 * standing allocations wrote from then on are replaced, so a month set by hand wins. Returns the months written and the
 * rows it removed (the audit's `before`).
 */
export async function setStanding(tx: Tx, s: Slot): Promise<{ months: string[]; removed: Record<string, unknown>[] }> {
  const slot = sql`person_id = ${s.personId} and project_id = ${s.projectId}`;
  const removed = await tx.execute(sql`delete from allocations.allocation where ${slot} and standing_id is not null and month >= ${s.month}::date returning to_char(month, 'YYYY-MM-DD') as month, percent`);
  await tx.execute(sql`update allocations.standing set until_month = ${s.month}, updated_by = ${s.by}, updated_at = now() where ${slot} and until_month is null and from_month < ${s.month}`);
  await tx.execute(sql`delete from allocations.standing where ${slot} and until_month is null and from_month >= ${s.month}`);
  if (s.percent === 0) return { months: [], removed };
  const months = ahead(s.month, HORIZON);
  const [row] = await tx.execute(sql`insert into allocations.standing (tenant_id, person_id, project_id, percent, from_month, filled_to, updated_by)
    values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${s.percent}, ${s.month}, ${months[months.length - 1]}, ${s.by}) returning id`);
  return { months: await fill(tx, row.id as string, s, months), removed };
}

/** A month removed by hand past what a standing allocation has written: the monthly job leaves it out. */
export async function skipMonths(tx: Tx, personId: string, projectId: string, months: string[]) {
  await tx.execute(sql`update allocations.standing set skip = array(select distinct unnest(skip || ${`{${months.join(",")}}`}::date[]))
    where person_id = ${personId} and project_id = ${projectId} and until_month is null`);
}

const open = (tx: Tx, where = sql`true`) => tx.execute(sql`select person_id, project_id from allocations.standing where until_month is null and ${where}`);

/** The people standing on a project now: their team rows read "until further notice". */
export const standingOn = async (tx: Tx, projectId: string) => new Set((await open(tx, sql`project_id = ${projectId}`)).map((r) => r.person_id as string));

/** Every open standing slot as "personId:projectId", for the grid's mark. */
export const standingSlots = async (tx: Tx) => new Set((await open(tx)).map((r) => `${r.person_id}:${r.project_id}`));

/** The monthly job's write: each open standing allocation, locked, is written up to HORIZON months ahead, skipping months removed by hand. */
export const extendStanding = defineService({
  name: "allocations.standing.extend",
  action: "allocations:allocate",
  resource: "allocations.standing",
  input: z.object({ today: z.string() }),
  async run(tx, input, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("allocations:allocate");
    const target = addMonths(monthOf(input.today), HORIZON - 1);
    const events: { name: string; payload: AllocationSet }[] = [];
    for (const s of await tx.execute(sql`select *, to_json(skip) as skips from allocations.standing where until_month is null and filled_to < ${target}::date for update`)) {
      const skip = new Set((s.skips as string[]).map(day));
      const months: string[] = [];
      for (let m = addMonths(day(s.filled_to), 1); m <= target; m = addMonths(m, 1)) if (!skip.has(m)) months.push(m);
      const written = await fill(tx, s.id as string, { personId: s.person_id as string, projectId: s.project_id as string, percent: Number(s.percent), by: "allocations.standing", tenantId: ctx.tenantId }, months);
      await tx.execute(sql`update allocations.standing set filled_to = ${target} where id = ${s.id}`);
      if (written.length) events.push({ name: EVENTS.allocationSet, payload: { personId: s.person_id as string, projectId: s.project_id as string, work: null, months: written, percent: Number(s.percent), by: "allocations.standing", standing: true } });
    }
    return { result: { written: events.reduce((n, e) => n + e.payload.months.length, 0) }, resourceId: null, after: { through: target, slots: events.length }, events };
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
