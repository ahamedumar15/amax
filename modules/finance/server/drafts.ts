import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { EVENTS, type InvoiceDrafted } from "../contracts";
import { lockContract, type ContractRow } from "./issue";
import { amt, monthLabel } from "./read";

export const timeInstalled = async (tx: Tx) => Boolean((await tx.execute(sql`select to_regclass('time.week') is not null as on`))[0]?.on);

export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

export async function uninvoicedTime(tx: Tx, c: Pick<ContractRow, "id" | "value">, month: string) {
  const [r] = await tx.execute(sql`select coalesce(sum(b.hours), 0) as hours, least(coalesce(sum(b.amount), 0) - coalesce((select sum(i.subtotal) from finance.invoice i where i.contract_id = ${c.id} and i.source = 'tm' and i.period = ${month}), 0),
      ${c.value}::numeric - coalesce((select sum(i.subtotal) from finance.invoice i where i.contract_id = ${c.id}), 0)) as amount
    from finance.billable b where b.contract_id = ${c.id} and b.period = ${month}`);
  return { hours: amt(r.hours), amount: amt(r.amount) };
}

type DraftInput = { contractId: string; source: "tm" | "milestone"; month?: string; milestoneId?: string };

async function draftFor(tx: Tx, tenantId: string, a: DraftInput) {
  const c = await lockContract(tx, a.contractId);
  const d = a.source === "tm" ? await tmDraft(tx, c, a.month!) : await milestoneDraft(tx, a.milestoneId!);
  const key = a.source === "tm" ? sql`period = ${a.month!}` : sql`milestone_id = ${a.milestoneId!}`;
  const [open] = await tx.execute(sql`select id, amount from finance.draft where contract_id = ${c.id} and source = ${a.source} and ${key} and status = 'open'`);
  if (open && amt(open.amount) === d?.amount) return null;
  if (open) await tx.execute(sql`update finance.draft set status = 'superseded' where id = ${open.id}`);
  if (!d || !(Number(d.amount) > 0)) return null;
  const [row] = await tx.execute(sql`insert into finance.draft (tenant_id, contract_id, source, period, milestone_id, description, hours, amount)
    values (${tenantId}, ${c.id}, ${a.source}, ${a.month ?? null}, ${a.milestoneId ?? null}, ${d.description}, ${d.hours}, ${d.amount}) returning id`);
  if (a.milestoneId) await tx.execute(sql`update finance.milestone set status = 'drafted' where id = ${a.milestoneId}`);
  const payload: InvoiceDrafted = { draftId: row.id as string, contractId: c.id, legalEntityId: c.legal_entity_id, source: a.source };
  return { name: EVENTS.invoiceDrafted, payload };
}

export const draftMilestones = defineService({
  name: "finance.invoice.draft-milestone",
  action: "finance:invoice:draft",
  resource: "finance.draft",
  input: z.object({ projectId: z.uuid(), version: z.string() }),
  async run(tx, a, ctx) {
    const due = await tx.execute(sql`select m.id, m.contract_id from finance.milestone m join finance.contract c on c.id = m.contract_id
      where c.project_id = ${a.projectId} and m.release_version = ${a.version} and m.status = 'pending'`);
    const events = [];
    for (const m of due) events.push(await draftFor(tx, ctx.tenantId, { contractId: m.contract_id as string, source: "milestone", milestoneId: m.id as string }));
    const made = events.filter((e) => e !== null);
    return { result: { drafts: made.length }, resourceId: a.projectId, after: { ...a, drafts: made.length }, events: made };
  },
});

export const draftFromTime = defineService({
  name: "finance.invoice.draft-time",
  action: "finance:invoice:draft",
  resource: "finance.draft",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), projects: z.array(z.object({ projectId: z.uuid(), billableHours: z.number().min(0) })) }),
  async run(tx, a, ctx) {
    const made = [];
    for (const c of await tx.execute(sql`select id, project_id, hourly_rate from finance.contract where kind = 'tm'`)) {
      const hours = a.projects.find((p) => p.projectId === c.project_id)?.billableHours ?? 0;
      await tx.execute(sql`insert into finance.billable (tenant_id, contract_id, period, source, hours, amount) values (${ctx.tenantId}, ${c.id}, ${a.month}, 'time', ${hours}, ${hours}::numeric * ${c.hourly_rate}::numeric)
        on conflict (contract_id, period, source) do update set hours = excluded.hours, amount = excluded.amount, updated_at = now()`);
      const e = await draftFor(tx, ctx.tenantId, { contractId: c.id as string, source: "tm", month: a.month });
      if (e) made.push(e);
    }
    return { result: { drafts: made.length }, resourceId: null, after: { month: a.month, drafts: made.length }, events: made };
  },
});

async function tmDraft(tx: Tx, c: ContractRow, month: string) {
  const t = await uninvoicedTime(tx, c, month);
  return { ...t, description: `${monthLabel(month)} hours, ${t.hours} h at ${amt(c.hourly_rate)} ${c.currency}` };
}

async function milestoneDraft(tx: Tx, milestoneId: string) {
  const [m] = await tx.execute(sql`select label, amount, status from finance.milestone where id = ${milestoneId}`);
  return m && m.status !== "invoiced" ? { amount: amt(m.amount), hours: null, description: m.label as string } : null;
}
