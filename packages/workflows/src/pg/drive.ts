import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { retryDelayMs } from "../duration";
import { errorText } from "../errors";
import { workflowOf, type WorkflowRegistry } from "../registry";
import type { StepOutcome } from "../execute";
import { advance, type Advance, type Command, type Execute } from "../replay";
import type { ResolvedStepOptions } from "../types";
import { lockEvent } from "./signal";
import { fenced, heartbeat, loadRun, release, startAttempt, writeStep, type ClaimedRun, type LoadedRun } from "./store";

export type DriveOptions = { leaseSeconds: number; deadline: number; maxCommands: number };
type Next = "continue" | "stop";

// Drives one claimed run as far as it can go: replay, run the next step, checkpoint it, repeat,
// until the run sleeps, waits, retries later, finishes, or the tick's time budget runs out.
export async function driveRun(db: Db, registry: WorkflowRegistry, run: ClaimedRun, o: DriveOptions): Promise<void> {
  for (let i = 0; i < o.maxCommands; i++) {
    const loaded = await withTenant(db, run.tenantId, (tx) => loadRun(tx, run, o.leaseSeconds));
    if (!loaded) return;
    let r: Advance;
    try {
      const def = workflowOf(registry, loaded.workflow);
      const info = { tenantId: run.tenantId, runId: run.id, actsFor: loaded.actsFor, legalEntityId: loaded.legalEntityId, version: loaded.version, input: loaded.input };
      r = await advance(def, info, loaded.history, executor(db, run, loaded, o.leaseSeconds));
    } catch (e) {
      if (e instanceof LostLease) return;
      r = { kind: "failed", error: errorText(e) };
    }
    const next = await withTenant(db, run.tenantId, (tx) => record(tx, run, loaded, r));
    if (next === "stop") return;
    if (Date.now() > o.deadline) {
      await withTenant(db, run.tenantId, (tx) => fenced(tx, run, sql`wake_at = now(), ${release}`));
      return;
    }
  }
}

class LostLease extends Error {}

// Gives up once every attempt has been used (including ones a crash cut short), records the
// attempt before running it, and heartbeats the lease while it runs.
function executor(db: Db, run: ClaimedRun, loaded: LoadedRun, leaseSeconds: number): Execute {
  return {
    attempt: (n) => (loaded.attempts[n] ?? 0) + 1,
    async around(name: string, options: ResolvedStepOptions, attempt: number, exec): Promise<StepOutcome> {
      if (attempt > options.maxAttempts) {
        return { ok: false, retryable: false, toolCalls: [], costUsd: 0, error: `gave up after ${options.maxAttempts} attempts; the last one never finished (the worker stopped)` };
      }
      if (!(await withTenant(db, run.tenantId, (tx) => startAttempt(tx, run, name, loaded.nextSeq, attempt, options)))) throw new LostLease();
      const stop = new AbortController();
      const end = heartbeat(db, run, leaseSeconds, stop);
      try {
        return await exec(stop.signal);
      } finally {
        end();
      }
    },
  };
}

async function record(tx: Tx, run: ClaimedRun, loaded: LoadedRun, r: Advance): Promise<Next> {
  switch (r.kind) {
    case "done":
      await fenced(tx, run, sql`status = 'completed', output = ${JSON.stringify(r.output)}::jsonb, finished_at = now(), wake_at = null, ${release}`);
      return "stop";
    case "failed":
      await fenced(tx, run, sql`status = 'failed', error = ${r.error}, finished_at = now(), wake_at = null, ${release}`);
      return "stop";
    case "executed":
      return recordStep(tx, run, loaded, r);
    case "blocked":
      return block(tx, run, loaded, r.command);
  }
}

async function recordStep(tx: Tx, run: ClaimedRun, loaded: LoadedRun, r: Extract<Advance, { kind: "executed" }>): Promise<Next> {
  const o = r.outcome;
  const attempt = (loaded.attempts[r.name] ?? 0) + 1;
  const retry = !o.ok && o.retryable && attempt < r.options.maxAttempts;
  const runSet = retry
    ? sql`cost_usd = cost_usd + ${o.costUsd}, status = 'running', wake_at = now() + make_interval(secs => ${retryDelayMs(r.options, attempt) / 1000}), ${release}`
    : sql`cost_usd = cost_usd + ${o.costUsd}`;
  if (!(await fenced(tx, run, runSet))) return "stop";
  const status = o.ok ? "done" : retry ? "retrying" : "failed";
  await writeStep(tx, { runId: run.id, tenantId: run.tenantId, name: r.name, seq: loaded.nextSeq, attempt, status, outcome: o, options: r.options });
  return retry ? "stop" : "continue";
}

async function block(tx: Tx, run: ClaimedRun, loaded: LoadedRun, c: Command): Promise<Next> {
  if (c.kind === "step") return "continue";
  if (c.kind === "wait") await lockEvent(tx, run.tenantId, c.event);
  const fireAt = c.kind === "sleep" ? sql`now() + make_interval(secs => ${c.ms / 1000})` : c.timeoutMs === null ? null : sql`now() + make_interval(secs => ${c.timeoutMs / 1000})`;
  await tx.execute(sql`insert into workflows.step (run_id, tenant_id, name, seq, kind, status, fire_at, wait_event, wait_match)
    values (${run.id}, ${run.tenantId}, ${c.name}, ${loaded.nextSeq}, ${c.kind}, ${c.kind === "sleep" ? "sleeping" : "waiting"}, ${fireAt},
            ${c.kind === "wait" ? c.event : null}, ${c.kind === "wait" ? JSON.stringify(c.match) : null}::jsonb)
    on conflict (run_id, name) do nothing`);
  if (c.kind === "wait" && (await takeBufferedSignal(tx, run, loaded.createdAt, c))) return "continue";
  const [step] = await tx.execute(sql`select fire_at from workflows.step where run_id = ${run.id} and name = ${c.name}`);
  const status = c.kind === "sleep" ? "sleeping" : "waiting";
  await fenced(tx, run, sql`status = ${status}, wake_at = ${step.fire_at as string | null}, ${release}`);
  return "stop";
}

// An event that arrived after the run started but before it reached this wait still counts; each
// signal satisfies at most one wait per run.
async function takeBufferedSignal(tx: Tx, run: ClaimedRun, since: string, c: Extract<Command, { kind: "wait" }>) {
  const rows = await tx.execute(sql`update workflows.step st set status = 'done', result = sig.payload, signal_id = sig.id, finished_at = now()
    from (select g.id, g.payload from workflows.signal g
           where g.event = ${c.event} and g.payload @> ${JSON.stringify(c.match)}::jsonb and g.created_at >= ${since}
             and not exists (select 1 from workflows.step u where u.run_id = ${run.id} and u.signal_id = g.id)
           order by g.created_at limit 1) sig
    where st.run_id = ${run.id} and st.name = ${c.name} and st.status = 'waiting'
    returning 1`);
  return rows.length > 0;
}
