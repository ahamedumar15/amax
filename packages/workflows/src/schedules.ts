import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { nextFire } from "./define";
import type { StartOptions } from "./engine";
import type { WorkflowRegistry } from "./registry";
import type { Json } from "./types";

/** Legal-entity country → the zone its schedules run in (AC-6). Anything else runs in UTC. */
export const ENTITY_ZONES: Record<string, string> = { LK: "Asia/Colombo", AU: "Australia/Sydney" };

type Start = (tenantId: string, workflow: string, input: Json, options: StartOptions) => Promise<string>;

export async function syncSchedules(db: Db, registry: WorkflowRegistry) {
  const defs = [...registry.schedules.values()].map((s) => ({ name: s.name, workflow: s.workflow, cron: s.cron, timezone: s.timezone ?? "UTC", enabled: s.enabled ?? true }));
  if (!defs.length) return 0;
  const [{ n }] = await db.execute(sql`select workflows.ensure_schedules(${JSON.stringify(defs)}::jsonb, ${JSON.stringify(ENTITY_ZONES)}::jsonb) as n`);
  return Number(n);
}

const inputFor = (base: Json | undefined, entity: string | null): Json =>
  entity && (base === undefined || (typeof base === "object" && base !== null && !Array.isArray(base))) ? { ...(base ?? {}), legalEntityId: entity } : (base ?? null);

// Starts one run per due schedule, keyed by the slot it fires for, so a retried tick never starts the
// same slot twice. A schedule that was down for a while fires once, then picks the next slot from now.
export async function fireSchedules(db: Db, registry: WorkflowRegistry, start: Start, o: { leaseSeconds: number; batch: number }) {
  const names = JSON.stringify([...registry.schedules.keys()]);
  const due = await db.execute(sql`select * from workflows.claim_schedules(${o.leaseSeconds}, ${o.batch}, ${names}::jsonb)`);
  let fired = 0;
  for (const row of due) {
    const def = registry.schedules.get(row.name as string)!;
    const tz = row.timezone as string;
    const next = nextFire(def.cron, tz).toISOString();
    await withTenant(db, row.tenant_id as string, async (tx) => {
      if (!row.next_run_at) {
        await tx.execute(sql`update workflows.schedule set next_run_at = ${next}, locked_until = null where id = ${row.id}`);
        return;
      }
      const slot = new Date(row.next_run_at as string).toISOString();
      const runId = await start(row.tenant_id as string, def.workflow, inputFor(def.input, row.legal_entity_id as string | null), { key: `schedule:${row.id}:${slot}`, startedBy: `schedule:${def.name}`, scheduleId: row.id as string, tx });
      await tx.execute(sql`update workflows.schedule set last_run_at = now(), last_run_id = ${runId}, next_run_at = ${next}, locked_until = null where id = ${row.id}`);
      fired++;
    });
  }
  return fired;
}
