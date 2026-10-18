import { EmptyState, PinButton } from "@amax/ui";
import { jobPin, viewPin } from "../pins";
import type { JobRow } from "../server/jobs";
import { AskButton } from "./AskButton";
import { Switch } from "./Switch";

// AC-3: the recurring agent jobs of every installed module, each switched on or off through chat.
export function Jobs({ jobs, canSwitch, horizon }: { jobs: JobRow[]; canSwitch: boolean; horizon: string }) {
  const pin = viewPin("Recurring agent work", horizon);
  return (
    <section className="card flush pinnable" aria-labelledby="jobs-title">
      <div className="card-head">
        <h2 id="jobs-title">Recurring agent work</h2>
        <AskButton label="New job" name="New job: ask amax to set up a recurring agent job" prompt="Set up a new recurring agent job that " pin={pin} />
        <PinButton pin={pin} />
      </div>
      {jobs.length === 0 ? <EmptyState icon="clock" title="No recurring agent work yet" hint="Jobs appear once the scheduler has run." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Recurring agent work</caption>
          <thead><tr><th scope="col">Job</th><th scope="col">Runs</th><th scope="col">Last result</th><th scope="col" className="num">On</th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id} className="pinnable" data-job={j.name}>
              <td data-label="Job"><b>{j.title}</b><small>{j.description}</small></td>
              <td data-label="Runs">{j.runs}</td>
              <td data-label="Last result">{j.result}</td>
              <td className="num" data-label="On">
                {canSwitch ? <Switch on={j.enabled} title={j.title} pin={jobPin(j)} /> : <span className={`chip ${j.enabled ? "good" : "warn"}`}>{j.enabled ? "On" : "Paused"}</span>}
                <PinButton pin={jobPin(j)} />
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}
