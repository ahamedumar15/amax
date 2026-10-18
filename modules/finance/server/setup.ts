import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { CONTRACT_KINDS, EVENTS, type ContractCreated } from "../contracts";
import { lockContract } from "./issue";
import { actorOf, mayAct } from "./read";

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "an amount like 1200 or 1200.50");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createContract = defineService({
  scoped: true,
  name: "finance.contract.create",
  action: "finance:contract:write",
  resource: "finance.contract",
  input: z.object({
    project: z.string().describe("The project's key or id, e.g. FLT"), legalEntityId: z.uuid().describe("The legal entity that bills it"),
    kind: z.enum(CONTRACT_KINDS), currency: z.string().length(3), value: money.describe("Fixed price, the T&M cap, or the retainer's total"),
    hourlyRate: money.optional(), monthlyFee: money.optional(), startsOn: day, renewsOn: day.optional(),
    paymentDays: z.number().int().min(0).max(180).default(30), taxTreatment: z.enum(["standard", "export"]).default("standard"),
  }),
  async run(tx, a, ctx) {
    mayAct(ctx, "finance:contract:write", a.legalEntityId);
    const p = await getProjectRef(tx, a.project);
    if (!p) throw new Error(`no project ${a.project}`);
    if (a.kind === "tm" && !a.hourlyRate) throw new Error("a time and materials contract needs an hourly rate");
    if (a.kind === "retainer" && !a.monthlyFee) throw new Error("a retainer needs a monthly fee");
    const by = actorOf(ctx);
    const [c] = await tx.execute(sql`insert into finance.contract (tenant_id, legal_entity_id, project_id, client, kind, currency, value, hourly_rate, monthly_fee, starts_on, renews_on, payment_days, tax_treatment, created_by)
      values (${ctx.tenantId}, ${a.legalEntityId}, ${p.id}, ${p.client}, ${a.kind}, ${a.currency.toUpperCase()}, ${a.value}, ${a.hourlyRate ?? null}, ${a.monthlyFee ?? null}, ${a.startsOn},
        ${a.renewsOn ?? null}, ${a.paymentDays}, ${a.taxTreatment}, ${by}) returning id`);
    const payload: ContractCreated = { contractId: c.id as string, projectId: p.id, legalEntityId: a.legalEntityId, kind: a.kind, by };
    return { result: { contractId: c.id as string, project: p.name, kind: a.kind }, resourceId: c.id as string, after: { ...a, projectId: p.id }, events: [{ name: EVENTS.contractCreated, payload }] };
  },
});

export const addMilestone = defineService({
  scoped: true,
  name: "finance.milestone.add",
  action: "finance:contract:write",
  resource: "finance.contract",
  input: z.object({ contractId: z.uuid(), label: z.string().min(1), amount: money, releaseVersion: z.string().optional().describe("Invoice it when this release reaches Prod, e.g. v2.4.0") }),
  async run(tx, a, ctx) {
    const c = await lockContract(tx, a.contractId);
    mayAct(ctx, "finance:contract:write", c.legal_entity_id);
    if (c.kind !== "fixed") throw new Error("milestones belong to fixed-price contracts");
    const [m] = await tx.execute(sql`insert into finance.milestone (tenant_id, contract_id, label, amount, release_version, position)
      values (${ctx.tenantId}, ${c.id}, ${a.label}, ${a.amount}, ${a.releaseVersion ?? null}, (select coalesce(max(position), 0) + 1 from finance.milestone where contract_id = ${c.id})) returning id`);
    return { result: { milestoneId: m.id as string }, resourceId: c.id, after: a };
  },
});

export const setFxRate = defineService({
  name: "finance.fx-rate.set",
  action: "finance:contract:write",
  resource: "finance.fx_rate",
  input: z.object({ from: z.string().length(3), to: z.string().length(3), rate: z.string().regex(/^\d+(\.\d{1,8})?$/), asOf: day, source: z.string().min(1) }),
  async run(tx, a, ctx) {
    const [r] = await tx.execute(sql`insert into finance.fx_rate (tenant_id, from_currency, to_currency, rate, as_of, source) values (${ctx.tenantId}, ${a.from.toUpperCase()}, ${a.to.toUpperCase()}, ${a.rate}, ${a.asOf}, ${a.source})
      on conflict (tenant_id, from_currency, to_currency, as_of) do update set rate = excluded.rate, source = excluded.source returning id`);
    return { result: { rateId: r.id as string }, resourceId: r.id as string, after: a };
  },
});
