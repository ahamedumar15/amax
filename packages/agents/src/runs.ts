import { canSee, pricedFor, type Viewer } from "@amax/auth";
import { getRuntime } from "@amax/core/server";
import { getRun, listSchedules, type RunView, type ScheduleView } from "@amax/workflows/server";
import { suggestionKinds } from "./kinds";
import { getSuggestion } from "./read";
import { host } from "./run";

const ownerOf = (actsFor: string | null) => (actsFor?.startsWith("user:") ? actsFor.slice(5) : null);
const registry = () => {
  const w = host().workflows;
  if (!w) throw new Error("amax: configureAgents({ workflows }) to read agent runs");
  return w();
};

/** 006 AC-4: the run behind a suggestion the viewer may see, classified fields masked by class, money only with pricing. */
export async function suggestionRun(v: Viewer, id: string): Promise<{ suggestionId: string; run: RunView | null } | null> {
  const s = await getSuggestion(v, id);
  if (!s) return null;
  const run = s.runId ? await getRun(getRuntime().db, registry(), v.tenantId, s.runId, (cls, actsFor) => canSee(v, cls, { ownerUserId: ownerOf(actsFor) })) : null;
  return { suggestionId: s.id, run: run ? pricedFor(v, run) : null };
}

/** The recurring jobs that make the installed kinds, as the scheduler has them. */
export async function agentJobs(v: Viewer): Promise<ScheduleView[]> {
  const names = new Set(suggestionKinds().flatMap((k) => k.jobs ?? []));
  return (await listSchedules(getRuntime().db, registry(), v.tenantId)).filter((s) => names.has(s.name));
}
