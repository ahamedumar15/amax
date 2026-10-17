import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService, type ServiceContext } from "@amax/core/server";
import type { RunAction } from "./engine";
import type { RunStatus } from "./types";

const ACTIVE: RunStatus[] = ["running", "sleeping", "waiting"];
const FROM: Record<RunAction, RunStatus[]> = { pause: ACTIVE, resume: ["paused"], cancel: [...ACTIVE, "paused"], retry: ["failed"] };
const pending = (action: RunAction) => sql`engine_action = case when engine = 'temporal' then ${action} end`;
const SET: Record<RunAction, ReturnType<typeof sql>> = {
  pause: sql`status = 'paused', ${pending("pause")}`,
  resume: sql`status = 'running', wake_at = now(), ${pending("resume")}`,
  cancel: sql`status = 'cancelled', finished_at = now(), wake_at = null, ${pending("cancel")}`,
  retry: sql`status = 'running', error = null, finished_at = null, wake_at = now(), launched_at = null, engine_action = null`,
};
const AFTER: Record<RunAction, RunStatus> = { pause: "paused", resume: "running", cancel: "cancelled", retry: "running" };
const PAST: Record<RunAction, string> = { pause: "paused", resume: "resumed", cancel: "cancelled", retry: "retried" };

/** The permission behind every admin control (Admin holds it; grant it to other roles to delegate). */
export const WORKFLOWS_ADMIN = "workflows:admin";

export type ControlledRun = { id: string; tenantId: string; engine: "postgres" | "temporal"; status: RunStatus; workflow: string };
/** Engine work that follows a committed control (Temporal signals, cancel, relaunch). The control
 * leaves it recorded as pending (engine_action / launched_at), so a failed hook is retried by the tick. */
export type ControlHook = (run: ControlledRun, action: RunAction) => Promise<void>;

// Each action is a service: authorised, written, audited and announced (workflows.run.paused, …)
// in one transaction. Retry clears the failed step so it runs again; every completed step keeps
// its checkpoint and is not re-run.
const runServices = Object.fromEntries((Object.keys(FROM) as RunAction[]).map((action) => [action, defineService({
  name: `workflows.run.${action}`,
  action: WORKFLOWS_ADMIN,
  resource: "workflows.run",
  input: z.object({ runId: z.uuid() }),
  async run(tx, { runId }, ctx) {
    const [row] = await tx.execute(sql`select id, engine, status, workflow from workflows.run where id = ${runId} for update`);
    if (!row) throw new Error(`run ${runId} not found`);
    const run = { ...(row as unknown as ControlledRun), tenantId: ctx.tenantId };
    if (!FROM[action].includes(run.status)) throw new Error(`can't ${action} a ${run.status} run`);
    if (action === "retry") await tx.execute(sql`delete from workflows.step where run_id = ${runId} and status in ('failed', 'retrying', 'started')`);
    await tx.execute(sql`update workflows.run set ${SET[action]}, lease = null, locked_until = null, updated_at = now() where id = ${runId}`);
    return {
      result: run,
      resourceId: runId,
      before: { status: run.status },
      after: { status: AFTER[action], workflow: run.workflow },
      events: [{ name: `workflows.run.${PAST[action]}`, payload: { runId, workflow: run.workflow, status: AFTER[action] } }],
    };
  },
})])) as Record<RunAction, ReturnType<typeof defineService<{ runId: string }, ControlledRun>>>;

export async function controlRun(ctx: ServiceContext, runId: string, action: RunAction, hook: ControlHook) {
  const run = await runServices[action](ctx, { runId });
  await hook(run, action);
}

// Switching a schedule off stops it creating runs; switching it on starts from the next slot, never
// a backlog of missed ones.
const scheduleService = defineService({
  name: "workflows.schedule.toggle",
  action: WORKFLOWS_ADMIN,
  resource: "workflows.schedule",
  input: z.object({ scheduleId: z.uuid(), enabled: z.boolean() }),
  async run(tx, { scheduleId, enabled }) {
    const [row] = await tx.execute(sql`update workflows.schedule s set enabled = ${enabled}, next_run_at = null, last_error = null, updated_at = now()
      from (select id, enabled as was from workflows.schedule where id = ${scheduleId} for update) old
      where s.id = old.id returning s.name, old.was`);
    if (!row) throw new Error(`schedule ${scheduleId} not found`);
    return {
      result: null,
      resourceId: scheduleId,
      before: { enabled: row.was },
      after: { enabled, name: row.name },
      events: [{ name: `workflows.schedule.${enabled ? "enabled" : "disabled"}`, payload: { scheduleId, name: row.name } }],
    };
  },
});

export const setScheduleEnabled = (ctx: ServiceContext, scheduleId: string, enabled: boolean) => scheduleService(ctx, { scheduleId, enabled });
