import { sql } from "drizzle-orm";
import { z } from "zod";
import { can, ScopeError, viewerOf } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { EVENTS, type LeaveCancelled } from "../contracts";
import { asDay, todayOf } from "./days";
import { by, dateSpan, leaveOf, loadRequest } from "./rows";

// The person cancels their own request, pending or approved, until the leave has ended; HR (leave:admin)
// cancels anyone's in their entities, including leave already taken (a correction).
export const cancelLeave = defineService({
  scoped: true, name: "leave.request.cancel", action: "leave:cancel", resource: "leave.request",
  input: z.object({ requestId: z.string().uuid() }),
  async run(tx, a, ctx) {
    const row = await loadRequest(tx, a.requestId);
    const v = viewerOf(ctx);
    const hr = !!v && can(v, "leave:admin", { legalEntityId: row.legal_entity_id });
    const own = !!v && !!row.user_id && can(v, "leave:cancel", { ownerUserId: row.user_id, legalEntityId: row.legal_entity_id });
    if (v && !hr && !own) throw new ScopeError("leave:cancel");
    if (row.status !== "pending" && row.status !== "approved") throw new Error(`that request is already ${row.status}`);
    if (!hr && asDay(row.ends_on) < (await todayOf(tx))) throw new Error("that leave has already been taken; ask HR to correct it");
    await tx.execute(sql`update leave.request set status = 'cancelled', cancelled_at = now(), cancelled_by = ${by(ctx)}, updated_at = now() where id = ${row.id}`);
    const payload: LeaveCancelled = { ...leaveOf(row), by: by(ctx), wasApproved: row.status === "approved" };
    return {
      result: { id: row.id, person: row.person_name as string, dates: dateSpan(payload.startsOn, payload.endsOn, payload.halfDay), status: "cancelled", wasApproved: payload.wasApproved },
      resourceId: row.id, before: { status: row.status }, after: { status: "cancelled" }, events: [{ name: EVENTS.cancelled, payload }],
    };
  },
});
