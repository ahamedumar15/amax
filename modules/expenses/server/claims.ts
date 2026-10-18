import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { EVENTS, PAY_VIA, type ClaimStepped } from "../contracts";
import { actorOf, money, type Row } from "./read";

export const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, "an amount like 3450 or 42.50");
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day like 2026-10-14");

export async function claimant(tx: Tx, ctx: ServiceContext): Promise<PersonRef> {
  const v = viewerOf(ctx);
  if (!v) throw new Error("say whose expense this is");
  const me = (await listPeople(tx, ctx, { status: ["active", "joining"] })).find((p) => p.userId === v.userId);
  if (!me) throw new Error("you have no HR record, so there's nothing to claim against; ask HR to add you");
  return me;
}

export async function categoryFor(tx: Tx, legalEntityId: string, ref: string): Promise<Row> {
  const [k] = await tx.execute(sql`select * from expenses.category where legal_entity_id = ${legalEntityId} and (key = ${ref.toLowerCase()} or id::text = ${ref} or lower(name) = ${ref.toLowerCase()})`);
  if (!k) {
    const all = await tx.execute(sql`select name from expenses.category where legal_entity_id = ${legalEntityId} order by name`);
    throw new Error(`no ${ref} category; choose one of ${all.map((r) => r.name).join(", ")}`);
  }
  return k;
}

async function receiptFor(tx: Tx, userId: string, id: string | undefined) {
  if (!id) return null;
  const [r] = await tx.execute(sql`select r.id, exists (select 1 from expenses.claim c where c.receipt_id = r.id and c.status <> 'withdrawn') as used
    from expenses.receipt r where r.id = ${id} and r.user_id = ${userId}`);
  if (!r) throw new Error("that receipt isn't one you added");
  if (r.used) throw new Error("that receipt is already on a claim");
  return r.id as string;
}

const nextNumber = async (tx: Tx) =>
  `EXP-${String((await tx.execute(sql`select coalesce(max(substring(number from 5)::int), 100) + 1 as n from expenses.claim`))[0].n).padStart(4, "0")}`;

export const ClaimInput = z.object({
  category: z.string().min(2).describe("The category's key or name, e.g. travel, meals, equipment, training, medical"),
  spentOn: day, merchant: z.string().trim().min(2).max(120), description: z.string().trim().min(3).max(500).describe("What it was for"),
  amount, currency: z.string().length(3).optional().describe("Defaults to the category's currency"),
  receiptId: z.uuid().optional().describe("From add_receipt; needed over the category's receipt threshold"),
  payVia: z.enum(PAY_VIA).optional().describe("payroll (next pay run, when payroll is installed) or bank; Finance decides when left out"),
});

/** Files the caller's claim: the tool's write, and the receipt agent's suggestion when the claimant accepts it. */
export async function fileClaim(tx: Tx, ctx: ServiceContext, a: z.infer<typeof ClaimInput>) {
  const me = await claimant(tx, ctx);
  const k = await categoryFor(tx, me.legalEntityId, a.category);
  const currency = (a.currency ?? String(k.currency)).toUpperCase();
  if (currency !== k.currency) throw new Error(`${k.name as string} claims are in ${k.currency as string}; convert the amount first`);
  const receiptId = await receiptFor(tx, me.userId!, a.receiptId);
  if (!receiptId && Number(a.amount) > Number(k.receipt_over)) throw new Error(`${k.name as string} claims over ${money(k.receipt_over, currency)} need a receipt; add it with add_receipt`);
  const over = Number(a.amount) > Number(k.claim_limit);
  const status = me.managerUserId ? "submitted" : "manager_approved";
  const number = await nextNumber(tx);
  const by = actorOf(ctx);
  const [c] = await tx.execute(sql`insert into expenses.claim (tenant_id, number, person_id, user_id, person_name, manager_user_id, legal_entity_id, category_id, receipt_id,
      spent_on, merchant, description, amount, currency, over_limit, status, pay_via, submitted_by)
    values (${ctx.tenantId}, ${number}, ${me.id}, ${me.userId}, ${me.name}, ${me.managerUserId}, ${me.legalEntityId}, ${k.id}, ${receiptId}, ${a.spentOn}, ${a.merchant}, ${a.description},
      ${a.amount}, ${currency}, ${over}, ${status}, ${a.payVia ?? null}, ${by}) returning id`);
  const payload: ClaimStepped = { claimId: c.id as string, number, userId: me.userId, managerUserId: me.managerUserId, legalEntityId: me.legalEntityId, status, by };
  const note = over ? `over the ${k.name as string} limit of ${money(k.claim_limit, currency)}, so the approvers will see it flagged` : null;
  return { result: { claimId: c.id as string, number, status, overLimit: over, note }, resourceId: c.id as string, after: { number, category: k.key, amount: a.amount, currency, status, overLimit: over },
    events: [{ name: EVENTS.claimSubmitted, payload }] };
}

export const claimExpense = defineService({
  name: "expenses.claim.submit", action: "expenses:claim", resource: "expenses.claim", input: ClaimInput,
  run: (tx, a, ctx) => fileClaim(tx, ctx, a),
});
