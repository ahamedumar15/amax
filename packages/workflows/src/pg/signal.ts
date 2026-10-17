import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Json } from "../types";

// Serialises a signal and a run starting to wait on the same (tenant, event): whichever commits
// second sees the other's row, so an event can't slip between "no signal yet" and "now waiting".
export const lockEvent = (tx: Tx, tenantId: string, event: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`workflows:${tenantId}:${event}`}, 29))`);

// Records the event (so a run that reaches its wait later still sees it) and wakes every run
// already waiting for it. Returns how many waits it satisfied; a repeated `id` does nothing.
export async function signalTx(tx: Tx, tenantId: string, event: string, payload: Json, id?: string) {
  await lockEvent(tx, tenantId, event);
  const [sig] = await tx.execute(sql`insert into workflows.signal (tenant_id, event, payload, source_id) values (${tenantId}, ${event}, ${JSON.stringify(payload)}::jsonb, ${id ?? null})
    on conflict (tenant_id, source_id) do nothing returning id`);
  if (!sig) return 0;
  const woken = await tx.execute(sql`update workflows.step set status = 'done', result = ${JSON.stringify(payload)}::jsonb, signal_id = ${sig.id}, finished_at = now()
    where tenant_id = ${tenantId} and status = 'waiting' and wait_event = ${event} and ${JSON.stringify(payload)}::jsonb @> wait_match
    returning run_id`);
  if (woken.length) {
    const ids = JSON.stringify(woken.map((w) => w.run_id));
    await tx.execute(sql`update workflows.run set wake_at = now(), status = 'running', updated_at = now()
      where id in (select jsonb_array_elements_text(${ids}::jsonb)::uuid) and status = 'waiting'`);
  }
  return woken.length;
}
