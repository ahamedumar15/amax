import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ClaimPaid, type PayVia } from "../contracts";
import { day } from "./claims";
import { stepped } from "./decide";
import { actorOf, loadClaim } from "./read";

/** Marks an approved claim paid; the caller has checked who may. */
export async function markPaid(tx: Tx, ctx: ServiceContext, id: string, paid: { on: string; reference: string; via?: PayVia }) {
  const row = await loadClaim(tx, id, true);
  if (row.status !== "approved") throw new Error(`${row.number as string} is ${row.status as string}, not approved for payment`);
  const via = paid.via ?? ((row.pay_via as PayVia | null) ?? "bank");
  const by = actorOf(ctx);
  await tx.execute(sql`update expenses.claim set status = 'paid', pay_via = ${via}, paid_on = ${paid.on}, paid_reference = ${paid.reference}, paid_by = ${by}, updated_at = now() where id = ${id}`);
  const payload: ClaimPaid = { ...stepped(row, "paid", by), payVia: via };
  return { row, payload };
}

export const recordExpensePayment = defineService({
  scoped: true, name: "expenses.claim.pay", action: "expenses:pay", resource: "expenses.claim",
  input: z.object({ claimId: z.uuid(), paidOn: day, reference: z.string().trim().min(3).max(200).describe("The bank transfer's reference"), payVia: z.enum(["bank", "payroll"]).default("bank") }),
  async run(tx, a, ctx) {
    const row = await loadClaim(tx, a.claimId);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "expenses:pay", { legalEntityId: row.legal_entity_id as string });
    const { payload } = await markPaid(tx, ctx, a.claimId, { on: a.paidOn, reference: a.reference, via: a.payVia });
    return { result: { claimId: a.claimId, number: row.number as string, status: "paid", payVia: payload.payVia }, resourceId: a.claimId, before: { status: row.status },
      after: { status: "paid", paidOn: a.paidOn, payVia: payload.payVia }, events: [{ name: EVENTS.claimPaid, payload }] };
  },
});
