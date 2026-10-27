import { sql } from "drizzle-orm";
import { z } from "zod";
import { viewerOf } from "@amax/auth";
import { defineService, logError } from "@amax/core/server";
import { userFacing } from "@amax/mcp";
import { eligible, STATUS, words, type BulkResult, type Kind } from "./bulk-card";
import { decide, mayDecide, writeRemind } from "./decide";
import { keyOf, type WeekRow } from "./weeks";

/**
 * What a failed person's row says (070 review rounds 1 to 3): the app's one rule for a refusal the caller may read
 * (userFacing, as the REST API uses it); anything else, a plain Error or a postgres-js connection error naming host
 * and port, is logged and shown only as a reference, since the row reaches the done card, the model and the audit.
 */
export const failureNote = (e: unknown): string => (userFacing(e) ? e.message : `couldn't be done (reference ${logError("time.bulk", e)})`);

/**
 * One confirmed card is one write (the chat engine's 043 rule), so the whole card is one service: each listed week
 * gets its own savepoint, so a failure rolls back only that person and the others still commit.
 */
const many = (kind: Kind) => defineService({
  scoped: true, name: `time.week.${kind}_many`, action: "time:approve", resource: "time.week", input: z.object({ weekIds: z.array(z.uuid()).min(1).max(50) }),
  async run(tx, a, ctx) {
    const may = mayDecide(tx, viewerOf(ctx));
    const results: BulkResult[] = [];
    const events: { name: string; payload: object }[] = [];
    for (const id of a.weekIds) {
      const [w] = (await tx.execute(sql`select * from time.week where id = ${id}`)) as unknown as WeekRow[];
      if (!w || !(await may(w))) { results.push({ person: "A timesheet", week: "", status: "skipped", note: "not one you can act on" }); continue; }
      const who = { person: w.person_name as string, week: keyOf(w) };
      if (!eligible[kind](w)) { results.push({ ...who, status: "skipped", note: `already ${STATUS[w.status] ?? w.status}` }); continue; }
      try {
        const out = await tx.transaction(async (sp) => {
          const [locked] = (await sp.execute(sql`select * from time.week where id = ${id} for update`)) as unknown as WeekRow[];
          return kind === "remind" ? writeRemind(ctx, locked) : decide(sp, ctx, locked, "approved", null);
        });
        events.push(...out.events);
        results.push({ ...who, status: "done", note: null });
      } catch (e) {
        results.push({ ...who, status: "failed", note: failureNote(e) });
      }
    }
    const n = (st: BulkResult["status"]) => results.filter((r) => r.status === st).length;
    const [verb, done] = words[kind];
    const shown = results.map((r) => ({ ...r, status: r.status === "done" ? done : r.status }));
    return { result: { summary: `${verb} ${n("done")} · skipped ${n("skipped")} · failed ${n("failed")}`, results: shown }, resourceId: a.weekIds[0], after: { results: shown }, events };
  },
});

export const remindMany = many("remind");
export const approveMany = many("approve");
