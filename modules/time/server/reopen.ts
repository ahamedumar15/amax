import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type WeekReopened } from "../contracts";
import { by, findWeek, keyOf } from "./weeks";

export const reopenWeek = defineService({
  name: "time.week.reopen",
  action: "time:admin",
  resource: "time.week",
  input: z.object({ weekId: z.string().uuid().optional(), person: z.string().optional(), week: z.string().optional(), reason: z.string().trim().min(3).max(1000) }),
  async run(tx, a, ctx) {
    const week = await findWeek(tx, a);
    if (week.status !== "approved") throw new Error(`${keyOf(week)} isn't approved, so it isn't locked`);
    await tx.execute(sql`update time.week set status = 'draft', locked_at = null, decided_at = null, decided_by = null, updated_at = now() where id = ${week.id}`);
    await tx.execute(sql`insert into time.approval (tenant_id, week_id, decision, chain, comment, decided_by) values (${ctx.tenantId}, ${week.id}, 'reopened', 'admin', ${a.reason}, ${by(ctx)})`);
    const payload: WeekReopened = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), reason: a.reason };
    return { result: { week: keyOf(week), status: "draft" }, resourceId: week.id, before: { status: "approved" }, after: { status: "draft", reason: a.reason }, events: [{ name: EVENTS.weekReopened, payload }] };
  },
});
