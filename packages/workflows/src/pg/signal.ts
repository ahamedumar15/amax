import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Json } from "../types";

// Records the event (so a run that reaches its wait later still sees it) and wakes every run
// already waiting for it. Returns how many waits it satisfied.
export async function signalTx(tx: Tx, tenantId: string, event: string, payload: Json) {
  const [sig] = await tx.execute(sql`insert into workflows.signal (tenant_id, event, payload) values (${tenantId}, ${event}, ${JSON.stringify(payload)}::jsonb) returning id`);
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
