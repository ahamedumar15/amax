import { notFound } from "next/navigation";
import { canSee, rolesOf } from "@amax/auth";
import { listRuns, listSchedules } from "@amax/workflows/server";
import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { RunsCard } from "../../../../components/workflows/RunsCard";
import { SchedulesCard } from "../../../../components/workflows/SchedulesCard";
import { getDb, workflowsRegistry } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import "../settings.css";

export const metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

const pin = (label: string, tool: string) => ({ label, tool, args: {} });
const ownerOf = (actsFor: string | null) => (actsFor?.startsWith("user:") ? actsFor.slice(5) : null);

export default async function WorkflowsSettingsPage() {
  const viewer = await getViewer();
  if (!viewer || !rolesOf(viewer).includes("Admin")) notFound();
  const db = getDb()!;
  const registry = workflowsRegistry();
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
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>Workflows</nav>
      <div className="row head">
        <div>
          <h1>Scheduler and runs</h1>
          <p className="lede">
            {schedules.filter((s) => s.enabled).length} of {schedules.length} recurring job{schedules.length === 1 ? " is" : "s are"} on. {active.length} run{active.length === 1 ? " is" : "s are"} in progress
            {waiting ? `, ${waiting} waiting for a person` : ""}. Waiting runs use no compute until they are woken. Changes happen in chat. Pin anything, then ask.
          </p>
        </div>
      </div>
      <div className="tickets four">
        <Ticket pin={pin("Recurring jobs on", "list_schedules")} tone="info" label="Recurring jobs on" value={`${schedules.filter((s) => s.enabled).length} of ${schedules.length}`} note="Times are in each entity's zone" />
        <Ticket pin={pin("Runs in progress", "list_workflow_runs")} tone="good" label="Runs in progress" value={String(active.length)} note={`${waiting} waiting for a person`} />
        <Ticket pin={pin("Failed runs", "list_workflow_runs")} tone={failed ? "problem" : "good"} label="Failed runs" value={String(failed)} note={failed ? "Retry re-runs only the failed step" : "None in the latest runs"} />
        <Ticket pin={pin("Model and API cost", "list_workflow_runs")} tone="attention" label="Model and API cost" value={`$${cost.toFixed(2)}`} note={`Across the latest ${runs.length} run${runs.length === 1 ? "" : "s"}`} />
      </div>
      <SchedulesCard schedules={schedules} />
      <RunsCard runs={runs} />
    </>
  );
}
