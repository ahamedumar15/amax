import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { appendAudit, contextFor, ForbiddenError } from "@amax/core/server";
import type { Admin, RunAction } from "./engine";
import type { RunStatus } from "./types";

const ACTIVE: RunStatus[] = ["running", "sleeping", "waiting"];
const FROM: Record<RunAction, RunStatus[]> = { pause: ACTIVE, resume: ["paused"], cancel: [...ACTIVE, "paused"], retry: ["failed"] };
const SET: Record<RunAction, ReturnType<typeof sql>> = {
  pause: sql`status = 'paused'`,
  resume: sql`status = 'running', wake_at = now()`,
  cancel: sql`status = 'cancelled', finished_at = now(), wake_at = null`,
  retry: sql`status = 'running', error = null, finished_at = null, wake_at = now()`,
};
const AFTER: Record<RunAction, RunStatus> = { pause: "paused", resume: "running", cancel: "cancelled", retry: "running" };

export type ControlledRun = { id: string; engine: "postgres" | "temporal"; status: RunStatus; workflow: string };
export type ControlHook = (tx: Tx, run: ControlledRun, action: RunAction) => Promise<void>;

function assertAdmin(admin: Admin) {
  if (!admin.roles.includes("Admin")) throw new ForbiddenError("workflows.admin", "workflows.run");
}
const ctxOf = (admin: Admin) => contextFor.ui(admin.tenantId, { id: `user:${admin.userId}`, roles: admin.roles });

// Pause, resume, cancel or retry a run, audited in the same transaction. Retry clears the failed
// step so it runs again; every completed step keeps its checkpoint and is not re-run.
export async function controlRun(db: Db, admin: Admin, runId: string, action: RunAction, hook: ControlHook) {
  assertAdmin(admin);
  await withTenant(db, admin.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`select id, engine, status, workflow from workflows.run where id = ${runId} for update`);
    if (!row) throw new Error(`run ${runId} not found`);
    const run = row as unknown as ControlledRun;
    if (!FROM[action].includes(run.status)) throw new Error(`can't ${action} a ${run.status} run`);
    if (action === "retry") await tx.execute(sql`delete from workflows.step where run_id = ${runId} and status in ('failed', 'retrying')`);
    await tx.execute(sql`update workflows.run set ${SET[action]}, lease = null, locked_until = null, updated_at = now() where id = ${runId}`);
    await hook(tx, run, action);
    await appendAudit(tx, ctxOf(admin), { action: `workflows.run.${action}`, resource: "workflows.run", resourceId: runId, before: { status: run.status }, after: { status: AFTER[action], workflow: run.workflow } });
  });
}

// Switching a schedule off stops it creating runs; switching it on starts from the next slot, never
// a backlog of missed ones.
export async function setScheduleEnabled(db: Db, admin: Admin, scheduleId: string, enabled: boolean) {
  assertAdmin(admin);
  await withTenant(db, admin.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`update workflows.schedule s set enabled = ${enabled}, next_run_at = null, updated_at = now()
      from (select id, enabled as was from workflows.schedule where id = ${scheduleId} for update) old
      where s.id = old.id returning s.name, old.was`);
    if (!row) throw new Error(`schedule ${scheduleId} not found`);
    await appendAudit(tx, ctxOf(admin), { action: `workflows.schedule.${enabled ? "enable" : "disable"}`, resource: "workflows.schedule", resourceId: scheduleId, before: { enabled: row.was }, after: { enabled, name: row.name } });
  });
}
