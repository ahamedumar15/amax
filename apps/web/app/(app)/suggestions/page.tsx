import { canEver } from "@amax/auth";
import { agentJobs, listSuggestions, suggestionRun } from "@amax/agents/server";
import { Card, EmptyState } from "@amax/ui";
import { AgentJobsCard } from "../../../components/agents/AgentJobsCard";
import { DecideTable } from "../../../components/agents/DecideTable";
import { RunCard } from "../../../components/agents/RunCard";
import { UndoTable } from "../../../components/agents/UndoTable";
import { PinnedTicket as Ticket } from "../../../components/settings/PinnedTicket";
import { getDb } from "../../../lib/server";
import { getViewer } from "../../../lib/viewer";
import "../settings/settings.css";
import "./suggestions.css";

export const metadata = { title: "Suggestions" };
export const dynamic = "force-dynamic";

const pin = (label: string, bucket: string) => ({ label, tool: "list_agent_suggestions", args: { bucket } });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// 006: agents never change data on their own. This screen leads with what waits for this person, then
// what can still be undone, the run behind a suggestion, and the recurring jobs that make them.
export default async function SuggestionsPage() {
  const viewer = await getViewer();
  if (!viewer || !getDb()) return <><h1>Suggestions</h1><Card><EmptyState icon="spark" title="Sign in to see suggestions" hint="Agents' suggestions, with their evidence and undo window, come from the database once you're signed in." /></Card></>;
  const [open, undoable, jobs] = await Promise.all([listSuggestions(viewer, { bucket: "open" }), listSuggestions(viewer, { bucket: "undoable" }), agentJobs(viewer)]);
  const second = open.filter((s) => s.status === "approved").length;
  const soon = open.filter((s) => new Date(s.expiresAt).getTime() - Date.now() < 86_400_000).length;
  const withRun = [...open, ...undoable].find((s) => s.runId) ?? null;
  const run = withRun ? (await suggestionRun(viewer, withRun.id))?.run ?? null : null;
  return (
    <>
      <div className="row head">
        <div>
          <h1>Suggestions</h1>
          <p className="lede">Agents never change data on their own. {plural(open.length - second, "suggestion")} need{open.length - second === 1 ? "s" : ""} your decision, {plural(second, "needs", "need")} a second approver, and {plural(undoable.length, "accepted change")} can still be undone. Decisions happen in chat. Pin anything, then ask.</p>
        </div>
      </div>
      <div className="tickets four">
        <Ticket pin={pin("Suggestions that need a decision", "open")} tone="info" label="Needs your decision" value={String(open.length - second)} note="Only those inside your data scope" />
        <Ticket pin={pin("Suggestions that need a second approver", "open")} tone="attention" label="Second approver needed" value={String(second)} note="Irreversible: can't be undone" />
        <Ticket pin={pin("Accepted suggestions that can be undone", "undoable")} tone="good" label="Can still be undone" value={String(undoable.length)} note="For 7 days, or until the module's cutoff" />
        <Ticket pin={pin("Suggestions expiring soon", "open")} tone={soon ? "problem" : "good"} label="Expiring today" value={String(soon)} note="An expired suggestion can't be accepted" />
      </div>
      <DecideTable rows={open} />
      <div className="sugg-cols">
        <UndoTable rows={undoable} />
        <RunCard s={withRun} run={run} />
      </div>
      <AgentJobsCard jobs={jobs} canSwitch={canEver(viewer, "workflows:admin")} />
    </>
  );
}
