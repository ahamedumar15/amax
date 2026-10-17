import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { canSee, type Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { getRun, listRuns, listSchedules, setEntityZone, setScheduleEnabled, WORKFLOWS_ADMIN, type ScheduleView } from "@amax/workflows/server";
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

// The Scheduler screen's tickets count within the latest runs, so the pins filter that same set:
// "Failed runs" and "Runs in progress" resolve to exactly the runs they count (052 review).
const LATEST = 50;
const RUN_STATUS = z.enum(["running", "sleeping", "waiting", "paused", "failed", "completed", "cancelled"]);
async function latestRuns(d: AdminDeps, v: Viewer, status?: z.infer<typeof RUN_STATUS> | z.infer<typeof RUN_STATUS>[]) {
  const runs = await listRuns(d.db(), d.workflows(), v.tenantId, see(v), { limit: LATEST });
  const want = status === undefined ? null : new Set<string>([status].flat());
  return want ? runs.filter((r) => want.has(r.status)) : runs;
}

async function entityId(d: AdminDeps, v: Viewer, ref: string) {
  const rows = await withTenant(d.db(), v.tenantId, (tx) => tx.execute(sql`select id, name from core.legal_entity order by name`));
  const hit = rows.find((r) => r.id === ref || String(r.name).toLowerCase() === ref.trim().toLowerCase());
  if (!hit) throw notFound(`legal entity "${ref}"`);
  return hit.id as string;
}

export const workflowTools = (d: AdminDeps) => [
  tool({ ...read(WORKFLOWS_ADMIN), name: "list_schedules", description: "Recurring agent work: each schedule, whether it is on, its zone and its last and next run.", input: z.object({}),
    run: (v) => listSchedules(d.db(), d.workflows(), v.tenantId) }),
  tool({ ...read(WORKFLOWS_ADMIN), name: "get_schedule", description: "One recurring schedule: on or paused, zone, last result and next run.", input: z.object({ schedule }),
    run: (v, a) => findSchedule(d, v, a.schedule) }),
  tool({ ...read(WORKFLOWS_ADMIN), name: "list_workflow_runs", description: `The latest ${LATEST} workflow runs with their steps, cost and status, optionally only those in the given statuses; classified fields masked.`,
    input: z.object({ status: z.union([RUN_STATUS, z.array(RUN_STATUS).min(1)]).optional() }),
    run: (v, a) => latestRuns(d, v, a.status) }),
  tool({ ...read(WORKFLOWS_ADMIN), name: "get_workflow_run", description: "One workflow run with its steps, cost and status; classified fields masked.", input: z.object({ runId: z.uuid() }),
    run: async (v, a) => (await getRun(d.db(), d.workflows(), v.tenantId, a.runId, see(v))) ?? Promise.reject(notFound(`run ${a.runId}`)) }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "control_workflow_run", description: "Pause, resume, cancel or retry a workflow run. Retry re-runs only the failed step.",
    input: z.object({ runId: z.uuid(), action: z.enum(["pause", "resume", "cancel", "retry"]) }),
    run: async (v, a, s) => { await (await d.engine()).control(ctxFor(v, s), a.runId, a.action); return { runId: a.runId, action: a.action }; } }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "set_schedule_enabled", description: "Pause (enabled false) or resume (enabled true) a recurring schedule. Resuming starts from the next slot.",
    input: z.object({ schedule, enabled: z.boolean() }),
    run: async (v, a, s) => { const hit = await findSchedule(d, v, a.schedule); await setScheduleEnabled(ctxFor(v, s), hit.id, a.enabled); return { scheduleId: hit.id, enabled: a.enabled }; } }),
  tool({ ...write(WORKFLOWS_ADMIN), name: "set_entity_zone", description: "Set a legal entity's time zone (IANA, e.g. Australia/Sydney), so its per-entity schedules run in it.",
    input: z.object({ entity: z.string().min(1).describe("The legal entity's id or name"), timezone: z.string().min(1) }),
    run: async (v, a, s) => setEntityZone(ctxFor(v, s), await entityId(d, v, a.entity), a.timezone) }),
];
