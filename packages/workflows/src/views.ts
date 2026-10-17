import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import type { Sensitivity } from "@amax/core/server";
import type { WorkflowRegistry } from "./registry";
import type { Classes, Json, RunStatus, ToolCall } from "./types";

export type Masked = { masked: true; class: Sensitivity };
/** Whether the viewer may see a class of field on a run that acts for `actsFor` (002 policy). */
export type CanSee = (cls: Sensitivity, actsFor: string | null) => boolean;

export type StepView = { name: string; kind: "step" | "sleep" | "wait"; status: string; attempts: number; result: Json | Masked; error: string | Masked | null; toolCalls: ToolCall[] | Masked; costUsd: number; fireAt: string | null; waitEvent: string | null; finishedAt: string | null };
export type RunView = { id: string; workflow: string; title: string; engine: string; status: RunStatus; actsFor: string | null; startedBy: string; input: Json | Masked; output: Json | Masked; error: string | Masked | null; costUsd: number; createdAt: string; finishedAt: string | null; wakeAt: string | null; steps: StepView[] };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// Masks classified fields of an object value; a classified scalar result is masked whole.
function maskValue(value: Json, classes: Classes, see: (c: Sensitivity) => boolean): Json | Masked {
  const hidden = Object.entries(classes).filter(([, c]) => !see(c));
  if (!hidden.length || value === null) return value;
  if (typeof value !== "object" || Array.isArray(value)) return { masked: true, class: hidden[0][1] };
  const out: Record<string, Json | Masked> = { ...value };
  for (const [field, cls] of hidden) if (field in out) out[field] = { masked: true, class: cls };
  return out as Json;
}

function stepView(s: Record<string, unknown>, see: (c: Sensitivity) => boolean): StepView {
  const classes = (s.sensitive ?? {}) as Classes;
  const hidden = Object.values(classes).find((c) => !see(c));
  return {
    name: s.name as string, kind: s.kind as StepView["kind"], status: s.status as string, attempts: Number(s.attempts),
    result: maskValue(s.result as Json, classes, see), error: s.error && hidden ? { masked: true, class: hidden } : ((s.error as string | null) ?? null),
    toolCalls: hidden ? { masked: true, class: hidden } : (s.tool_calls as ToolCall[]),
    costUsd: Number(s.cost_usd), fireAt: iso(s.fire_at), waitEvent: (s.wait_event as string | null) ?? null, finishedAt: iso(s.finished_at),
  };
}

/** How many runs the run views show: the Scheduler screen's window and its tickets' counts. */
export const LATEST_RUNS = 50;

export async function listRuns(db: Db, registry: WorkflowRegistry, tenantId: string, see: CanSee, o: { limit?: number; status?: RunStatus | RunStatus[]; id?: string } = {}): Promise<RunView[]> {
  const statuses = o.status === undefined ? [] : [o.status].flat();
  // An empty status list matches no run; it never widens to every run (052 review).
  if (o.status !== undefined && !statuses.length) return [];
  return withTenant(db, tenantId, async (tx) => {
    const runs = await tx.execute(sql`select * from workflows.run where ${o.id ? sql`id = ${o.id}` : statuses.length ? sql`status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : sql`true`} order by created_at desc limit ${o.limit ?? LATEST_RUNS}`);
    const ids = JSON.stringify(runs.map((r) => r.id));
    const steps = await tx.execute(sql`select * from workflows.step where run_id in (select jsonb_array_elements_text(${ids}::jsonb)::uuid) order by seq`);
    return runs.map((r) => {
      const def = registry.workflows.get(r.workflow as string);
      const actsFor = (r.acts_for as string | null) ?? null;
      const canSee = (c: Sensitivity) => see(c, actsFor);
      const hidden = Object.values({ ...def?.sensitive?.input, ...def?.sensitive?.output }).find((c) => !canSee(c));
      return {
        id: r.id as string, workflow: r.workflow as string, title: def?.title ?? (r.workflow as string), engine: r.engine as string, status: r.status as RunStatus,
        actsFor, startedBy: r.started_by as string,
        input: maskValue(r.input as Json, def?.sensitive?.input ?? {}, canSee), output: maskValue(r.output as Json, def?.sensitive?.output ?? {}, canSee),
        error: r.error && hidden ? { masked: true, class: hidden } : ((r.error as string | null) ?? null), costUsd: Number(r.cost_usd), createdAt: iso(r.created_at)!, finishedAt: iso(r.finished_at), wakeAt: iso(r.wake_at),
        steps: steps.filter((s) => s.run_id === r.id).map((s) => stepView(s, canSee)),
      };
    });
  });
}

export const getRun = async (db: Db, registry: WorkflowRegistry, tenantId: string, runId: string, see: CanSee) =>
  (await listRuns(db, registry, tenantId, see, { id: runId, limit: 1 }))[0] ?? null;

export type ScheduleView = { id: string; name: string; title: string; description: string | null; cron: string; timezone: string | null; entity: string | null; enabled: boolean; lastError: string | null; nextRunAt: string | null; lastRunAt: string | null; lastStatus: RunStatus | null; lastSummary: string | null };

// A run's output may carry a plain-language `summary` ("1 new risk") for the schedules table,
// unless the workflow classifies it.
function summaryOf(registry: WorkflowRegistry, workflow: string, output: Json | null) {
  if (registry.workflows.get(workflow)?.sensitive?.output?.summary) return null;
  const summary = output && typeof output === "object" && !Array.isArray(output) ? output.summary : null;
  return typeof summary === "string" ? summary : null;
}

export async function listSchedules(db: Db, registry: WorkflowRegistry, tenantId: string): Promise<ScheduleView[]> {
  const rows = await withTenant(db, tenantId, (tx) => tx.execute(sql`select s.*, e.name as entity_name, r.status as last_status, r.output as last_output
    from workflows.schedule s left join core.legal_entity e on e.id = s.legal_entity_id left join workflows.run r on r.id = s.last_run_id
    order by s.name, e.name nulls first`));
  return rows.filter((s) => registry.schedules.has(s.name as string)).map((s) => {
    const def = registry.schedules.get(s.name as string)!;
    return {
      id: s.id as string, name: s.name as string, title: def.title, description: def.description ?? null, cron: s.cron as string, timezone: (s.timezone as string | null) ?? null, lastError: (s.last_error as string | null) ?? null,
      entity: (s.entity_name as string | null) ?? null, enabled: Boolean(s.enabled), nextRunAt: iso(s.next_run_at), lastRunAt: iso(s.last_run_at),
      lastStatus: (s.last_status as RunStatus | null) ?? null, lastSummary: summaryOf(registry, def.workflow, s.last_output as Json | null),
    };
  });
}
