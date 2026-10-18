import type { ScheduleView } from "@amax/workflows/server";
import { EmptyState, PinButton } from "@amax/ui";
import { cronLabel } from "../../lib/cron-label";
import { AskButton } from "../settings/AskButton";

// An admin's pin resolves the one schedule; anyone else's, the list it sits in.
const pinOf = (s: ScheduleView, admin: boolean) => (admin ? { label: s.title, tool: "get_schedule", args: { schedule: s.id } } : { label: s.title, tool: "list_agent_jobs", args: {} });

// 006 AC-4: recurring agent jobs that make suggestions, switched on and off in chat (workflows:admin).
export function AgentJobsCard({ jobs, canSwitch }: { jobs: ScheduleView[]; canSwitch: boolean }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Agent jobs</h2><PinButton inline pin={{ label: "Agent jobs", tool: "list_agent_jobs", args: {} }} /><span className="muted note">{jobs.filter((j) => j.enabled).length} of {jobs.length} on</span></div>
      {jobs.length === 0 ? <EmptyState icon="clock" title="No agent jobs yet" hint="Jobs appear once the scheduler has run." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Agent jobs</caption>
          <thead><tr><th>Job</th><th>Runs</th><th>Status</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id} className="pinnable">
              <td data-label="Job"><b>{j.title}</b><small>{j.description}</small></td>
              <td data-label="Runs">{cronLabel(j.cron)}</td>
              <td data-label="Status"><span className={`chip ${j.enabled ? "good" : "warn"}`}>{j.enabled ? "On" : "Paused"}</span></td>
              <td className="num"><span className="ask-row">
                {canSwitch && <AskButton label={j.enabled ? "Ask amax to switch off" : "Ask amax to switch on"} prompt={`${j.enabled ? "Pause" : "Resume"} the ${j.title} schedule`} pin={pinOf(j, canSwitch)} tool="set_schedule_enabled" name={`${j.enabled ? "Switch off" : "Switch on"} ${j.title}`} />}
                <PinButton pin={pinOf(j, canSwitch)} />
              </span></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
