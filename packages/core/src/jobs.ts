import { CronExpressionParser } from "cron-parser";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import type { EventHandlerDef, JobDef, ModuleManifest } from "./module";

export type JobRegistry = { jobs: Map<string, JobDef>; handlers: EventHandlerDef[] };

export function registryFrom(modules: Pick<ModuleManifest, "id" | "jobs" | "events">[]): JobRegistry {
  const jobs = new Map<string, JobDef>();
  for (const m of modules) {
    for (const j of m.jobs ?? []) {
      if (jobs.has(j.name)) throw new Error(`job "${j.name}" is declared twice`);
      jobs.set(j.name, j);
    }
  }
  return { jobs, handlers: modules.flatMap((m) => m.events?.handles ?? []) };
}

export const nextRun = (cron: string, from = new Date()) => CronExpressionParser.parse(cron, { currentDate: from, tz: "UTC" }).next().toDate();

const MAX_ATTEMPTS = 10;
const backoffSeconds = (attempts: number) => Math.min(3600, 30 * 2 ** (attempts - 1));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 2000);

// Queues a one-off (or keyed, deduplicated) job for the current tenant.
export async function scheduleJob(tx: Tx, job: { tenantId: string; name: string; payload?: Record<string, unknown>; runAt?: Date; key?: string }) {
  await tx.execute(sql`insert into core.job (tenant_id, name, key, payload, run_at)
    values (${job.tenantId}, ${job.name}, ${job.key ?? null}, ${JSON.stringify(job.payload ?? {})}::jsonb, ${(job.runAt ?? new Date()).toISOString()})
    on conflict (tenant_id, key) do nothing`);
}

// Runs fn at most once per (handler, event): the marker row and the handler's writes commit together.
export async function onceForEvent(tx: Tx, handlerId: string, event: { id: string; tenantId: string }, fn: () => Promise<void>) {
  const claimed = await tx.execute(sql`insert into core.processed_event (handler, event_id, tenant_id)
    values (${handlerId}, ${event.id}, ${event.tenantId}) on conflict do nothing returning 1`);
  if (claimed.length) await fn();
  return claimed.length > 0;
}

export type TickResult = { jobs: number; jobsFailed: number; events: number; eventsFailed: number; scheduled: number };

// One tick: sync cron schedules, run due jobs, deliver pending events. At least once: a crash
// mid-job leaves the lease to expire and the next tick retries.
export async function runDueJobs(db: Db, registry: JobRegistry, opts: { leaseSeconds?: number; batch?: number } = {}): Promise<TickResult> {
  const lease = opts.leaseSeconds ?? 300;
  const batch = opts.batch ?? 50;
  const result: TickResult = { jobs: 0, jobsFailed: 0, events: 0, eventsFailed: 0, scheduled: 0 };

  for (const j of registry.jobs.values()) {
    if (!j.cron) continue;
    const [{ n }] = await db.execute(sql`select core.ensure_schedule(${j.name}, ${j.cron}, ${nextRun(j.cron).toISOString()}) as n`);
    result.scheduled += Number(n);
  }

  const jobs = await db.execute(sql`select * from core.claim_jobs(${lease}, ${batch})`);
  for (const job of jobs) {
    const def = registry.jobs.get(job.name as string);
    const tenantId = job.tenant_id as string;
    try {
      if (!def) throw new Error(`no module declares job "${job.name}"`);
      await withTenant(db, tenantId, async (tx) => {
        await def.run({ tx, tenantId, payload: job.payload as Record<string, unknown>, jobId: job.id as string });
        if (job.cron) {
          await tx.execute(sql`update core.job set run_at = ${nextRun(job.cron as string).toISOString()}, attempts = 0, locked_until = null, last_error = null where id = ${job.id}`);
        } else {
          await tx.execute(sql`update core.job set status = 'done', locked_until = null, last_error = null where id = ${job.id}`);
        }
      });
      result.jobs++;
    } catch (e) {
      result.jobsFailed++;
      const attempts = Number(job.attempts);
      const failed = attempts >= MAX_ATTEMPTS && !job.cron;
      const runAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
      await withTenant(db, tenantId, (tx) =>
        tx.execute(sql`update core.job set status = ${failed ? "failed" : "pending"}, run_at = ${runAt}, locked_until = null, last_error = ${message(e)} where id = ${job.id}`));
    }
  }

  const events = await db.execute(sql`select * from core.claim_events(${lease}, ${batch})`);
  for (const ev of events) {
    const tenantId = ev.tenant_id as string;
    const event = { id: ev.id as string, name: ev.name as string, payload: ev.payload as Record<string, unknown> };
    const errors: string[] = [];
    for (const h of registry.handlers.filter((x) => x.event === event.name)) {
      try {
        await withTenant(db, tenantId, (tx) => onceForEvent(tx, h.id, { id: event.id, tenantId }, () => h.handle({ tx, tenantId, event })));
      } catch (e) {
        errors.push(`${h.id}: ${message(e)}`);
      }
    }
    await withTenant(db, tenantId, (tx) =>
      errors.length
        ? tx.execute(sql`update core.event set locked_until = now() + make_interval(secs => ${backoffSeconds(Number(ev.attempts))}), last_error = ${errors.join("; ")} where id = ${event.id}`)
        : tx.execute(sql`update core.event set delivered_at = now(), locked_until = null, last_error = null where id = ${event.id}`));
    if (errors.length) result.eventsFailed++;
    else result.events++;
  }
  return result;
}
