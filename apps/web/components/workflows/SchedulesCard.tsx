import type { ScheduleView } from "@amax/workflows/server";
import { EmptyState, PinButton } from "@amax/ui";
import { cronLabel, whenLabel } from "../../lib/cron-label";
import { AskButton } from "../settings/AskButton";

const lastResult = (s: ScheduleView) => (s.lastError ? `Couldn't start: ${s.lastError}` : null) ?? s.lastSummary ?? (s.lastStatus ? s.lastStatus[0].toUpperCase() + s.lastStatus.slice(1) : "No runs yet");
const labelOf = (s: ScheduleView) => (s.entity ? `${s.title}, ${s.entity}` : s.title);
const pinOf = (s: ScheduleView) => ({ label: labelOf(s), tool: "get_schedule", args: { schedule: s.id } });

// No zone yet: the fix is set_entity_zone, asked for in chat (029 follow-up, 047 AC-6).
function NextRun({ s }: { s: ScheduleView }) {
  if (!s.enabled) return <>Paused</>;
  if (s.timezone) return <>{whenLabel(s.nextRunAt, s.timezone)}</>;
  return (<>Not scheduled: set the entity&apos;s time zone
    <small><AskButton label="Ask to set the time zone" prompt={`Set the time zone for ${s.entity ?? "this entity"} to `} pin={pinOf(s)} tool="set_entity_zone" name={`Ask to set the time zone for ${s.entity ?? s.title}`} /></small></>);
}

export function SchedulesCard({ schedules }: { schedules: ScheduleView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Recurring agent work</h2><PinButton inline pin={{ label: "Recurring agent work", tool: "list_schedules", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>{schedules.filter((s) => s.enabled).length} of {schedules.length} on</span></div>
      {schedules.length === 0 ? (
        <EmptyState icon="clock" title="No recurring work yet" hint="Schedules appear here when an installed module declares one and the scheduler has run." />
      ) : (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Recurring agent work</caption>
            <thead><tr><th>Job</th><th>Runs</th><th>Last result</th><th>Next run</th><th>Status</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="pinnable">
                  <td data-label="Job"><b>{s.title}</b><small>{[s.description, s.entity].filter(Boolean).join(" · ")}</small></td>
                  <td data-label="Runs">{cronLabel(s.cron)}<small>{s.timezone ?? "No time zone for this entity"}</small></td>
                  <td data-label="Last result">{lastResult(s)}<small>{whenLabel(s.lastRunAt, s.timezone ?? "UTC")}</small></td>
                  <td data-label="Next run"><NextRun s={s} /></td>
                  <td data-label="Status"><span className={`chip ${s.enabled ? "good" : "warn"}`}>{s.enabled ? "On" : "Paused"}</span></td>
                  <td className="num">
                    <AskButton label={s.enabled ? "Ask to pause" : "Ask to resume"} prompt={`${s.enabled ? "Pause" : "Resume"} the ${labelOf(s)} schedule`} pin={pinOf(s)} tool="set_schedule_enabled" name={`${s.enabled ? "Ask to pause" : "Ask to resume"} ${labelOf(s)}`} />
                    <PinButton pin={pinOf(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
