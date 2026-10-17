import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { appendAudit, defineService } from "@amax/core/server";
import { actorOf } from "./common";
import { insertOpportunity } from "./opportunities";

// An agent's find becomes an opportunity only when a person accepts it (module standard).
async function lockOpen(tx: Tx, id: string) {
  const [s] = await tx.execute(sql`select * from presales.suggestion where id = ${id} for update`);
  if (!s) throw new Error("no such suggestion");
  if (s.status !== "open") throw new Error(`that suggestion was already ${s.status}`);
  return s;
}

export const acceptSuggestion = defineService({
  name: "presales.suggestion.accept",
  action: "presales:opportunity:create",
  resource: "presales.suggestion",
  input: z.object({ id: z.string().uuid() }),
  async run(tx, input, ctx) {
    const s = await lockOpen(tx, input.id);
    const created = await insertOpportunity(tx, {
      client: s.client_name as string, title: s.title as string, value: Number(s.value_amount), currency: (s.value_currency as string).trim(),
      stage: "new-idea", ownerName: (s.owner_name as string | null) ?? undefined, leadSource: s.source_label as string, note: `Found by the inbox agent: ${s.source_label}`,
    }, ctx);
    await appendAudit(tx, ctx, { action: "presales.opportunity.create", resource: "presales.opportunity", resourceId: created.result.id, after: created.after });
    await tx.execute(sql`update presales.suggestion set status = 'accepted', opportunity_id = ${created.result.id}, decided_by = ${actorOf(ctx)}, decided_at = now() where id = ${s.id}`);
    return { ...created, resourceId: s.id as string, before: { status: "open" }, after: { status: "accepted", number: created.result.number } };
  },
});

export const dismissSuggestion = defineService({
  name: "presales.suggestion.dismiss",
  action: "presales:opportunity:create",
  resource: "presales.suggestion",
  input: z.object({ id: z.string().uuid() }),
  async run(tx, input, ctx) {
    const s = await lockOpen(tx, input.id);
    await tx.execute(sql`update presales.suggestion set status = 'dismissed', decided_by = ${actorOf(ctx)}, decided_at = now() where id = ${s.id}`);
    return { result: { id: s.id as string, status: "dismissed" }, resourceId: s.id as string, before: { status: "open" }, after: { status: "dismissed" } };
  },
});
