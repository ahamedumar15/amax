import { notFound } from "next/navigation";
import { canSee, rolesOf } from "@amax/auth";
import { Ticket } from "@amax/ui";
import { listRuns, listSchedules, syncSchedules } from "@amax/workflows/server";
import { RunsCard } from "../../../../components/workflows/RunsCard";
import { SchedulesCard } from "../../../../components/workflows/SchedulesCard";
import { getDb, workflowsRegistry } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { runControlAction, toggleScheduleAction } from "./actions";
import "../settings.css";

export const metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

const ownerOf = (actsFor: string | null) => (actsFor?.startsWith("user:") ? actsFor.slice(5) : null);

export default async function WorkflowsSettingsPage() {
  const viewer = await getViewer();
  if (!viewer || !rolesOf(viewer).includes("Admin")) notFound();
  const db = getDb()!;
  const registry = workflowsRegistry();
  await syncSchedules(db, registry);
  const [schedules, runs] = await Promise.all([
    listSchedules(db, registry, viewer.tenantId),
    listRuns(db, registry, viewer.tenantId, (cls, actsFor) => canSee(viewer, cls, { ownerUserId: ownerOf(actsFor) }), { limit: 50 }),
  ]);
  const active = runs.filter((r) => ["running", "sleeping", "waiting"].includes(r.status));
  const waiting = runs.filter((r) => r.status === "waiting").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const cost = runs.reduce((sum, r) => sum + r.costUsd, 0);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span>Workflows</nav>
      <div className="row head">
        <div>
          <h1>Scheduler and runs</h1>
          <p className="lede">
            {schedules.filter((s) => s.enabled).length} of {schedules.length} recurring job{schedules.length === 1 ? " is" : "s are"} on. {active.length} run{active.length === 1 ? " is" : "s are"} in progress
            {waiting ? `, ${waiting} waiting for a person` : ""}. Waiting runs use no compute until they are woken.
          </p>
        </div>
      </div>
      <div className="tickets four">
        <Ticket tone="info" label="Recurring jobs on" value={`${schedules.filter((s) => s.enabled).length} of ${schedules.length}`} note="Times are in each entity's zone" />
        <Ticket tone="good" label="Runs in progress" value={String(active.length)} note={`${waiting} waiting for a person`} />
        <Ticket tone={failed ? "problem" : "good"} label="Failed runs" value={String(failed)} note={failed ? "Retry re-runs only the failed step" : "None in the latest runs"} />
        <Ticket tone="attention" label="Model and API cost" value={`$${cost.toFixed(2)}`} note={`Across the latest ${runs.length} run${runs.length === 1 ? "" : "s"}`} />
      </div>
      <SchedulesCard schedules={schedules} toggle={toggleScheduleAction} />
      <RunsCard runs={runs} control={runControlAction} />
    </>
  );
}
