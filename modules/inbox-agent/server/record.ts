import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ScanCompleted } from "../contracts";
import { by } from "./context";
import { EXCERPT_MAX } from "./excerpt";

// The scan's writes: one audited service per scan, counts only in the audit and the event, never an
// excerpt. A source taken off the allow-list while the scan ran gets no finds.
const started = z.iso.datetime();
const Message = z.object({ sourceId: z.uuid(), ref: z.string().length(64), at: z.iso.datetime({ offset: true }), excerpt: z.string().max(EXCERPT_MAX), link: z.string().nullable() });
const ScanInput = z.object({ startedAt: started, messages: z.array(Message).max(5000), sources: z.array(z.uuid()) });
export type ScanInput = z.infer<typeof ScanInput>;

export const messageRef = (sourceId: string, id: string) => createHash("sha256").update(`${sourceId}:${id}`).digest("hex");

/** Writes the scan and its finds in the caller's transaction (the service below, and fixtures). */
export async function writeScan(tx: Tx, ctx: ServiceContext, a: ScanInput) {
  const [scan] = await tx.execute(sql`insert into inbox_agent.scan (tenant_id, started_at, status, started_by) values (${ctx.tenantId}, ${a.startedAt}, 'completed', ${by(ctx)}) returning id`);
  const findIds: string[] = [];
  for (const m of a.messages) {
    const [row] = await tx.execute(sql`insert into inbox_agent.find (tenant_id, source_id, scan_id, message_ref, received_at, excerpt, link, acts_for)
      select ${ctx.tenantId}, s.id, ${scan.id}, ${m.ref}, ${m.at}, ${m.excerpt}, ${m.link}, s.acts_for from inbox_agent.source s where s.id = ${m.sourceId} and s.removed_at is null
      on conflict (tenant_id, source_id, message_ref) do nothing returning id`);
    if (row) findIds.push(row.id as string);
  }
  for (const id of a.sources) {
    const last = a.messages.filter((m) => m.sourceId === id).map((m) => m.at).sort().at(-1) ?? null;
    await tx.execute(sql`update inbox_agent.source set read_until = greatest(read_until, coalesce(${last}::timestamptz, read_until)) where id = ${id}`);
  }
  await tx.execute(sql`update inbox_agent.scan set messages = ${findIds.length} where id = ${scan.id}`);
  return { scanId: scan.id as string, findIds };
}

export const recordScan = defineService({
  name: "inbox-agent.scan.record", action: "inbox-agent:scan", resource: "inbox_agent.scan", input: ScanInput,
  async run(tx, a, ctx) {
    const out = await writeScan(tx, ctx, a);
    const payload: ScanCompleted = { scanId: out.scanId, status: "completed", messages: out.findIds.length };
    return { result: out, resourceId: out.scanId, after: { messages: out.findIds.length, sources: a.sources.length }, events: [{ name: EVENTS.scanned, payload }] };
  },
});

export const failScan = defineService({
  name: "inbox-agent.scan.fail", action: "inbox-agent:scan", resource: "inbox_agent.scan",
  input: z.object({ startedAt: started, failure: z.string().min(1).max(500) }),
  async run(tx, a, ctx) {
    const [row] = await tx.execute(sql`insert into inbox_agent.scan (tenant_id, started_at, status, failure, started_by) values (${ctx.tenantId}, ${a.startedAt}, 'failed', ${a.failure}, ${by(ctx)}) returning id`);
    const payload: ScanCompleted = { scanId: row.id as string, status: "failed", messages: 0 };
    return { result: payload, resourceId: payload.scanId, after: { status: "failed", failure: a.failure }, events: [{ name: EVENTS.scanned, payload }] };
  },
});
