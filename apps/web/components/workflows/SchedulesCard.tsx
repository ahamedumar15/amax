import type { ScheduleView } from "@amax/workflows/server";
import { EmptyState } from "@amax/ui";
import { cronLabel, whenLabel } from "../../lib/cron-label";

type Props = { schedules: ScheduleView[]; toggle: (data: FormData) => Promise<void> };

const lastResult = (s: ScheduleView) => (s.lastError ? `Couldn't start: ${s.lastError}` : null) ?? s.lastSummary ?? (s.lastStatus ? s.lastStatus[0].toUpperCase() + s.lastStatus.slice(1) : "No runs yet");

export function SchedulesCard({ schedules, toggle }: Props) {
  return (
    <div className="card flush">
      <div className="card-head"><h2>Recurring agent work</h2><span className="muted" style={{ fontSize: 13 }}>{schedules.filter((s) => s.enabled).length} of {schedules.length} on</span></div>
      {schedules.length === 0 ? (
        <EmptyState icon="clock" title="No recurring work yet" hint="Schedules appear here when an installed module declares one." />
      ) : (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Recurring agent work</caption>
            <thead><tr><th>Job</th><th>Runs</th><th>Last result</th><th>Next run</th><th className="num">On</th></tr></thead>
            <tbody>
              {schedules.map((s) => {
                const label = s.entity ? `${s.title}, ${s.entity}` : s.title;
                return (
                  <tr key={s.id}>
                    <td data-label="Job"><b>{s.title}</b><small>{[s.description, s.entity].filter(Boolean).join(" · ")}</small></td>
                    <td data-label="Runs">{cronLabel(s.cron)}<small>{s.timezone ?? "No time zone for this entity"}</small></td>
                    <td data-label="Last result">{lastResult(s)}<small>{whenLabel(s.lastRunAt, s.timezone ?? "UTC")}</small></td>
                    <td data-label="Next run">{!s.enabled ? "Off" : s.timezone ? whenLabel(s.nextRunAt, s.timezone) : "Not scheduled: set the entity's time zone"}</td>
                    <td data-label="On" className="num">
                      <form action={toggle}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="enabled" value={String(!s.enabled)} />
                        <button type="submit" className="switch" role="switch" aria-checked={s.enabled} aria-label={label} />
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
