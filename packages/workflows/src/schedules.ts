import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { nextFire } from "./define";
import type { StartOptions } from "./engine";
import { errorText } from "./errors";
import type { WorkflowRegistry } from "./registry";
import type { Json } from "./types";

/** Default zone per legal-entity country (AC-6); a workflows.entity_zone row overrides it. An
 * entity with neither has no zone, and its per-entity schedules don't fire until one is set. */
export const ENTITY_ZONES: Record<string, string> = { LK: "Asia/Colombo", AU: "Australia/Sydney" };

type Start = (tenantId: string, workflow: string, input: Json, options: StartOptions) => Promise<string>;

export async function syncSchedules(db: Db, registry: WorkflowRegistry) {
  const defs = [...registry.schedules.values()].map((s) => ({ name: s.name, workflow: s.workflow, cron: s.cron, timezone: s.timezone ?? "UTC", enabled: s.enabled ?? true }));
  if (!defs.length) return 0;
  const [{ n }] = await db.execute(sql`select workflows.ensure_schedules(${JSON.stringify(defs)}::jsonb, ${JSON.stringify(ENTITY_ZONES)}::jsonb) as n`);
  return Number(n);
}

// Starts one run per due schedule, keyed by the slot it fires for, so a retried tick never starts the
// same slot twice. A schedule that was down for a while fires once, then picks the next slot from now.
// A schedule that can't start (bad input, say) records the error and moves on to its next slot.
export async function fireSchedules(db: Db, registry: WorkflowRegistry, start: Start, o: { leaseSeconds: number; batch: number; log?: (msg: string) => void }) {
  const names = JSON.stringify([...registry.schedules.keys()]);
  const due = await db.execute(sql`select * from workflows.claim_schedules(${o.leaseSeconds}, ${o.batch}, ${names}::jsonb)`);
  let fired = 0;
  for (const row of due) {
    const def = registry.schedules.get(row.name as string)!;
    const tenantId = row.tenant_id as string;
    const next = nextFire(def.cron, row.timezone as string).toISOString();
    try {
      await withTenant(db, tenantId, async (tx) => {
        if (!row.next_run_at) return void (await tx.execute(sql`update workflows.schedule set next_run_at = ${next}, locked_until = null where id = ${row.id}`));
        const slot = new Date(row.next_run_at as string).toISOString();
        const runId = await start(tenantId, def.workflow, def.input ?? null, { key: `schedule:${row.id}:${slot}`, startedBy: `schedule:${def.name}`, scheduleId: row.id as string, legalEntityId: (row.legal_entity_id as string | null) ?? null, tx });
        await tx.execute(sql`update workflows.schedule set last_run_at = now(), last_run_id = ${runId}, last_error = null, next_run_at = ${next}, locked_until = null where id = ${row.id}`);
        fired++;
      });
    } catch (e) {
      o.log?.(`workflows: schedule ${def.name} failed to start: ${errorText(e)}`);
      await withTenant(db, tenantId, (tx) => tx.execute(sql`update workflows.schedule set last_error = ${errorText(e)}, next_run_at = ${next}, locked_until = null where id = ${row.id}`));
    }
  }
  return fired;
}
