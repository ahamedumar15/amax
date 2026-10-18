import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { auditWrite, decider } from "./decide";
import { kindOf, SuggestionError } from "./kinds";
import { DECIDE, lockRow } from "./store";

// 006 AC-3: an accepted change is undone through the kind's inverse write, in the same transaction
// as the suggestion's status, for 7 days or until the module's cutoff. Irreversible kinds never are.
export const undoSuggestion = defineService({
  scoped: true,
  name: "agents.suggestion.undo",
  action: DECIDE,
  resource: "agents.suggestion",
  input: z.object({ id: z.uuid(), reason: z.string().min(2).max(500).optional() }),
  async run(tx, { id, reason }, ctx) {
    const row = await lockRow(tx, id, ["accepted"]);
    const kind = kindOf(row.kind);
    const me = decider(ctx, row, kind);
    if (kind.irreversible || !kind.undo || !row.undo_until) throw new SuggestionError("this change can't be undone: it had a second approver instead");
    if (row.undo_over) throw new SuggestionError(`the undo window closed on ${new Date(row.undo_until as string).toISOString().slice(0, 10)}`);
    const w = await kind.undo(tx, ctx, row.proposed, row.applied);
    await auditWrite(tx, ctx, kind, row, w);
    await tx.execute(sql`update agents.suggestion set status = 'undone', undone_by = ${me}, undone_at = now(), updated_at = now() where id = ${id}`);
    return {
      result: { id, status: "undone" },
      resourceId: id,
      before: { status: "accepted" },
      after: { decision: "undone", by: me, agent: row.agent, actsFor: row.acts_for, kind: row.kind, reason: reason ?? null },
      events: [{ name: "agents.suggestion.undone", payload: { suggestionId: id, kind: row.kind } }],
    };
  },
});
