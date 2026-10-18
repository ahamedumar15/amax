import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { canSee, pricedFor, type Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { getRun, LATEST_RUNS, runServices, listRuns, listSchedules, setEntityZone, setScheduleEnabled, WORKFLOWS_ADMIN, type ScheduleView } from "@amax/workflows/server";
import { ctxFor, notFound, read, tool, write, type AdminDeps } from "./tool";

const ownerOf = (actsFor: string | null) => (actsFor?.startsWith("user:") ? actsFor.slice(5) : null);
const see = (v: Viewer) => (cls: Parameters<typeof canSee>[1], actsFor: string | null) => canSee(v, cls, { ownerUserId: ownerOf(actsFor) });
const label = (s: ScheduleView) => (s.entity ? `${s.title}, ${s.entity}` : s.title);
const schedule = z.string().min(1).describe("The schedule's id, or its title as on the Scheduler screen; add the entity for per-entity ones, e.g. 'Payroll reminder, Lumen Labs Pty Ltd'");

async function findSchedule(d: AdminDeps, v: Viewer, ref: string) {
  const all = await listSchedules(d.db(), d.workflows(), v.tenantId);
  const want = ref.trim().toLowerCase();
  const exact = all.find((s) => s.id === ref) ?? all.find((s) => label(s).toLowerCase() === want);
  if (exact) return exact;
  // A bare title is enough only when it names one schedule; per-entity ones share a title, and
  // picking the first would write to an entity nobody named (052 review).
  const byTitle = all.filter((s) => s.title.toLowerCase() === want);
  if (byTitle.length > 1) throw new ToolError(`"${ref}" names ${byTitle.length} schedules; say which: ${byTitle.map((s) => `'${label(s)}'`).join(", ")}`, "invalid_input");
  if (!byTitle.length) throw notFound(`schedule "${ref}"`);
  return byTitle[0];
}

// By default the status filter is in the query, so older matching runs are found. The Scheduler
// screen's tickets count within the latest runs; their pins pass withinLatest, so "Failed runs" and
// "Runs in progress" resolve to exactly the runs they count (052 review rounds 2 and 3).
const LATEST = LATEST_RUNS;
const RUN_STATUS = z.enum(["running", "sleeping", "waiting", "paused", "failed", "completed", "cancelled"]);
async function runsFor(d: AdminDeps, v: Viewer, status: z.infer<typeof RUN_STATUS> | z.infer<typeof RUN_STATUS>[] | undefined, withinLatest: boolean) {
  if (!withinLatest) return listRuns(d.db(), d.workflows(), v.tenantId, see(v), { limit: LATEST, status });
  const runs = await listRuns(d.db(), d.workflows(), v.tenantId, see(v), { limit: LATEST });
  const want = status === undefined ? null : new Set<string>([status].flat());
  return want ? runs.filter((r) => want.has(r.status)) : runs;
}

async function entityId(d: AdminDeps, v: Viewer, ref: string) {
  const rows = await withTenant(d.db(), v.tenantId, (tx) => tx.execute(sql`select id, name from core.legal_entity order by name`));
  const byId = rows.find((r) => r.id === ref);
  if (byId) return byId.id as string;
  // A name that matches more than one entity is refused, as findSchedule does: picking the first
  // would set the zone of an entity nobody named (053).
  const byName = rows.filter((r) => String(r.name).toLowerCase() === ref.trim().toLowerCase());
  if (byName.length > 1) throw new ToolError(`"${ref}" names ${byName.length} legal entities; give the id of one: ${byName.map((r) => `'${r.name}' (${r.id})`).join(", ")}`, "invalid_input");
  if (!byName.length) throw notFound(`legal entity "${ref}"`);
  return byName[0].id as string;
}

export const workflowTools = (d: AdminDeps) => [
  tool({ ...read(WORKFLOWS_ADMIN), pin: "view", name: "list_schedules", description: "Recurring agent work: each schedule, whether it is on, its zone and its last and next run.", input: z.object({}),
    run: (v) => listSchedules(d.db(), d.workflows(), v.tenantId) }),
  tool({ ...read(WORKFLOWS_ADMIN), pin: "view", name: "get_schedule", description: "One recurring schedule: on or paused, zone, last result and next run.", input: z.object({ schedule }),
    run: (v, a) => findSchedule(d, v, a.schedule) }),
  tool({ ...read(WORKFLOWS_ADMIN), pin: "view", name: "list_workflow_runs", description: `Up to ${LATEST} workflow runs, newest first, with their steps, cost and status; classified fields masked. status filters by one or more statuses. withinLatest: true filters only the latest ${LATEST} runs, as the Scheduler screen's tickets count them.`,
    input: z.object({ status: z.union([RUN_STATUS, z.array(RUN_STATUS).min(1)]).optional(), withinLatest: z.boolean().optional() }),
    run: async (v, a) => pricedFor(v, await runsFor(d, v, a.status, a.withinLatest ?? false)) }),
  tool({ ...read(WORKFLOWS_ADMIN), pin: { id: "runId", of: (r: { id: string; title: string } | null) => (r ? { id: r.id, label: `${r.title} run ${r.id.slice(0, 8)}` } : null) }, name: "get_workflow_run", description: "One workflow run with its steps, cost and status; classified fields masked.", input: z.object({ runId: z.uuid() }),
    run: async (v, a) => pricedFor(v, (await getRun(d.db(), d.workflows(), v.tenantId, a.runId, see(v))) ?? await Promise.reject(notFound(`run ${a.runId}`))) }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "control_workflow_run", description: "Pause, resume, cancel or retry a workflow run. Retry re-runs only the failed step.",
    input: z.object({ runId: z.uuid(), action: z.enum(["pause", "resume", "cancel", "retry"]) }),
    service: Object.values(runServices), run: async (v, a, s) => { await (await d.engine()).control(ctxFor(v, s), a.runId, a.action); return { runId: a.runId, action: a.action }; } }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "set_schedule_enabled", description: "Pause (enabled false) or resume (enabled true) a recurring schedule. Resuming starts from the next slot.",
    input: z.object({ schedule, enabled: z.boolean() }), service: setScheduleEnabled,
    run: async (v, a, s) => { const hit = await findSchedule(d, v, a.schedule); await setScheduleEnabled(ctxFor(v, s), hit.id, a.enabled); return { scheduleId: hit.id, enabled: a.enabled }; } }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "set_entity_zone", description: "Set a legal entity's time zone (IANA, e.g. Australia/Sydney), so its per-entity schedules run in it.",
    input: z.object({ entity: z.string().min(1).describe("The legal entity's id or name"), timezone: z.string().min(1) }),
    service: setEntityZone, run: async (v, a, s) => setEntityZone(ctxFor(v, s), await entityId(d, v, a.entity), a.timezone) }),
];
