import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray, type Tx } from "@amax/db";
import { keyed } from "../chain-key";
import type { ServiceContext } from "../authorize";
import { defineService } from "../service";
import { PRIVACY_MANAGE } from "./catalog";
import { inventory, summarise, type Item } from "./inventory";
import { PrivacyError, resolveSubject } from "./subjects";

export type RequestRow = { id: string; kind: "access" | "erasure"; status: string; subjectUserId: string | null; subjectLabel: string; subjects: string[]; inventory: Item[]; openedBy: string; openedAt: string; approvedBy: string | null; completedAt: string | null; erased: number | null };

export const personOf = (ctx: ServiceContext) => ctx.onBehalfOf ?? ctx.actor.id;

export const toRequest = (r: Record<string, unknown>): RequestRow => ({
  id: r.id as string, kind: r.kind as RequestRow["kind"], status: r.status as string, subjectUserId: (r.subject_user_id as string | null) ?? null,
  subjectLabel: r.subject_label as string, subjects: r.subjects as string[], inventory: r.inventory as Item[], openedBy: r.opened_by as string,
  openedAt: new Date(r.opened_at as string).toISOString(), approvedBy: (r.approved_by as string | null) ?? null,
  completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null, erased: (r.erased as number | null) ?? null,
});

export async function loadRequest(tx: Tx, id: string, lock = false) {
  const [r] = await tx.execute(sql`select * from privacy.request where id = ${id} ${lock ? sql`for update` : sql``}`);
  if (!r) throw new PrivacyError(`no privacy request ${id}`);
  return toRequest(r);
}

export const openPrivacyRequest = defineService({
  name: "privacy.request.open",
  action: PRIVACY_MANAGE,
  resource: "privacy.request",
  input: z.object({ kind: z.enum(["access", "erasure"]), person: z.string().min(1).max(200) }),
  async run(tx, input, ctx) {
    const s = await resolveSubject(tx, input.person);
    const [dup] = await tx.execute(sql`select id from privacy.request where subject_user_id = ${s.userId} and kind = ${input.kind} and status in ('open', 'approved')`);
    if (dup) throw new PrivacyError(`${s.label} already has an open ${input.kind} request`);
    const items = await inventory(tx, s);
    const [row] = await tx.execute(sql`insert into privacy.request (tenant_id, kind, subject_user_id, subject_label, subject_key, subjects, inventory, opened_by)
      values (${ctx.tenantId}, ${input.kind}, ${s.userId}, ${s.label}, ${keyed(s.userId)}, ${textArray(s.ids)}, ${JSON.stringify(items)}::jsonb, ${personOf(ctx)}) returning id`);
    const after = { kind: input.kind, ...summarise(items) };
    return { result: { id: row.id as string, kind: input.kind, person: s.label, ...summarise(items), inventory: items }, resourceId: row.id as string, after, events: [{ name: "privacy.request.opened", payload: { id: row.id, kind: input.kind } }] };
  },
});
