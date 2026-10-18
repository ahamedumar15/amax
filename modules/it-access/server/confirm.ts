import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type ChangeApplied } from "../contracts";
import { effect } from "./changes";
import { actorOf, APPROVE, mayAct, today } from "./read";

// A change left to IT by hand (`manual`) changes nothing here until a person says they made it. Only a
// person can confirm, and only a change that is waiting; then the records follow and it is announced.
export const confirmChange = defineService({
  scoped: true,
  name: "it-access.change.confirm",
  action: APPROVE,
  resource: "it_access.change",
  input: z.object({ changeId: z.uuid().describe("The waiting change's id, from list_access (waiting) or get_access_change") }),
  async run(tx, { changeId }, ctx) {
    if (ctx.actor.kind !== "user") throw new Error("only a person can confirm they made an access change by hand");
    mayAct(ctx, APPROVE);
    const [c] = await tx.execute(sql`select * from it_access.change where id = ${changeId} for update`);
    if (!c) throw new Error("no such access change");
    if (c.status !== "manual") throw new Error(`that change is ${c.status as string}, not waiting for IT to make it by hand`);
    const by = actorOf(ctx);
    const detail = await effect(tx, c as never, by, today());
    const outcome = `Made by hand, confirmed by ${by}`;
    await tx.execute(sql`update it_access.change set status = 'applied', outcome = ${outcome}, detail = ${JSON.stringify(detail)}::jsonb, applied_at = now() where id = ${changeId}`);
    const payload: ChangeApplied = { changeId, action: c.action as ChangeApplied["action"], status: "applied" };
    return { result: { changeId, status: "applied", outcome }, resourceId: changeId, before: { status: "manual" }, after: { status: "applied", outcome }, events: [{ name: EVENTS.changeApplied, payload }] };
  },
});
