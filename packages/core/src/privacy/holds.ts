import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray, type Tx } from "@amax/db";
import { defineService } from "../service";
import { PRIVACY_MANAGE } from "./catalog";
import type { Match } from "./match";
import { PrivacyError, resolveSubject } from "./subjects";

export async function heldIds(tx: Tx): Promise<string[]> {
  return (await held(tx)).ids;
}

/** Everyone under an active hold: their ids, and for a person hold their name, so rows that record
 * them only by name (subjectName) are held too. */
export async function held(tx: Tx): Promise<Match> {
  const rows = await tx.execute(sql`select kind, label, subjects from privacy.legal_hold where released_at is null`);
  return {
    ids: [...new Set(rows.flatMap((r) => r.subjects as string[]))],
    names: [...new Set(rows.filter((r) => r.kind === "person").map((r) => r.label as string))],
  };
}

const Place = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), person: z.string().min(1).max(200), reason: z.string().min(3).max(500) }),
  z.object({ kind: z.literal("matter"), matter: z.string().min(1).max(200), ids: z.array(z.string().min(1).max(200)).min(1).max(20), reason: z.string().min(3).max(500) }),
]);

export const placeLegalHold = defineService({
  name: "privacy.hold.place",
  action: PRIVACY_MANAGE,
  resource: "privacy.legal_hold",
  input: Place,
  async run(tx, input, ctx) {
    const subject = input.kind === "person" ? await resolveSubject(tx, input.person) : { label: input.matter, ids: input.ids };
    const [row] = await tx.execute(sql`insert into privacy.legal_hold (tenant_id, kind, label, subjects, reason, placed_by)
      values (${ctx.tenantId}, ${input.kind}, ${subject.label}, ${textArray(subject.ids)}, ${input.reason}, ${ctx.actor.id}) returning id`);
    const after = { kind: input.kind, subjects: subject.ids.length };
    return { result: { id: row.id as string, label: subject.label }, resourceId: row.id as string, after, events: [{ name: "privacy.hold.placed", payload: { id: row.id, kind: input.kind } }] };
  },
});

export const releaseLegalHold = defineService({
  name: "privacy.hold.release",
  action: PRIVACY_MANAGE,
  resource: "privacy.legal_hold",
  input: z.object({ id: z.uuid() }),
  async run(tx, input, ctx) {
    const [row] = await tx.execute(sql`update privacy.legal_hold set released_at = now(), released_by = ${ctx.actor.id} where id = ${input.id} and released_at is null returning kind`);
    if (!row) throw new PrivacyError(`no active legal hold ${input.id}`);
    return { result: { id: input.id, released: true }, resourceId: input.id, after: { released: true }, events: [{ name: "privacy.hold.released", payload: { id: input.id } }] };
  },
});
