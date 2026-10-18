import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type LeaveApproved, type LeaveRejected } from "../contracts";
import { by, dateSpan, leaveOf, loadRequest, paidType, type RequestRow } from "./rows";
import { chainFor } from "./scope";

async function decide(tx: Tx, ctx: ServiceContext, row: RequestRow, to: "approved" | "rejected", comment: string | null) {
  const chain = chainFor(viewerOf(ctx), row);
  if (!chain) throw new ScopeError("leave:approve");
  if (row.status !== "pending") throw new Error(`${row.person_name as string}'s request is ${row.status}, not pending`);
  await tx.execute(sql`update leave.request set status = ${to}, decided_at = now(), decided_by = ${by(ctx)}, decision_comment = ${comment}, updated_at = now() where id = ${row.id}`);
  const base = { ...leaveOf(row), by: by(ctx) };
  const event = to === "approved"
    ? { name: EVENTS.approved, payload: { ...base, paid: await paidType(tx, row.legal_entity_id, row.type as string) } satisfies LeaveApproved }
    : { name: EVENTS.rejected, payload: base satisfies LeaveRejected };
  return {
    result: { id: row.id, person: row.person_name as string, type: row.type as string, dates: dateSpan(base.startsOn, base.endsOn, base.halfDay), status: to, chain },
    resourceId: row.id, before: { status: row.status }, after: { status: to, chain, comment }, events: [event],
  };
}

const ref = { requestId: z.string().uuid() };

export const approveLeave = defineService({
  scoped: true, name: "leave.request.approve", action: "leave:approve", resource: "leave.request", input: z.object(ref),
  run: async (tx, a, ctx) => decide(tx, ctx, await loadRequest(tx, a.requestId), "approved", null),
});

export const rejectLeave = defineService({
  scoped: true, name: "leave.request.reject", action: "leave:approve", resource: "leave.request",
  input: z.object({ ...ref, comment: z.string().trim().min(3, "say why it's rejected").max(1000) }),
  run: async (tx, a, ctx) => decide(tx, ctx, await loadRequest(tx, a.requestId), "rejected", a.comment),
});
