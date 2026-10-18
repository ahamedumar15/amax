import { canEver, type Viewer } from "@amax/auth";
import { getRuntime } from "@amax/core/server";
import { host } from "@amax/agents/run";
import { suggestionKinds } from "@amax/agents/server";
import { listSchedules, type ScheduleView } from "@amax/workflows/server";
import { JOBS } from "../contracts";
import { cronLabel } from "./cron";

export type JobRow = { id: string; name: string; title: string; description: string | null; runs: string; result: string; enabled: boolean };

const resultOf = (s: ScheduleView) => (s.lastError ? `Couldn't start: ${s.lastError}` : null) ?? s.lastSummary ?? (s.lastStatus ? s.lastStatus[0].toUpperCase() + s.lastStatus.slice(1) : "No runs yet");

// AC-3: every installed module's recurring agent jobs (the 029 schedules behind its suggestion kinds,
// the inbox agent's Teams and email scan among them) and insights' own, as the scheduler has them.
export async function recurringJobs(v: Viewer): Promise<JobRow[]> {
  const workflows = host().workflows;
  if (!workflows) return [];
  const names = new Set<string>([...Object.values(JOBS), ...suggestionKinds().flatMap((k) => k.jobs ?? [])]);
  return (await listSchedules(getRuntime().db, workflows(), v.tenantId)).filter((s) => names.has(s.name))
    .map((s) => ({ id: s.id, name: s.name, title: s.title, description: s.description, runs: cronLabel(s.cron), result: resultOf(s), enabled: s.enabled }));
}

/** Switching a job on or off is set_schedule_enabled, in chat after its confirm: Settings, Workflows' permission. */
export const canSwitch = (v: Viewer) => canEver(v, "workflows:admin");
