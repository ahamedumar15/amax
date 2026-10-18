import type { DrillView } from "@amax/core/backup";
import { PinButton } from "@amax/ui";
import { dayTime, duration, RESULT, resultText, rows, shortDay } from "./format";

const chain = (d: DrillView) => (d.chainOk ? ["good", "Verified"] : d.chainOk === false ? ["bad", "Broken"] : ["info", "Not checked"]);

export function DrillTable({ drills }: { drills: DrillView[] }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Restore drills, newest first</caption>
      <thead><tr><th>Date</th><th>Backup from</th><th className="num">Duration</th><th className="num">Rows checked</th><th>Audit chain</th><th>Result</th></tr></thead>
      <tbody>
        {drills.length === 0 && <tr><td colSpan={6} className="muted">No restore drill has run yet. The first runs on Sunday, or ask amax to run one now.</td></tr>}
        {drills.map((d) => {
          const [tone, text] = chain(d);
          const pin = { label: `Restore drill ${shortDay(d.startedAt ?? d.requestedAt)}`, tool: "get_restore_drill", args: { drillId: d.id } };
          return (
            <tr key={d.id} className="pinnable">
              <td data-label="Date">{shortDay(d.startedAt ?? d.requestedAt)}</td>
              <td data-label="Backup from">{d.backupTakenAt ? dayTime(d.backupTakenAt) : "Latest"}</td>
              <td data-label="Duration" className="num">{d.durationMs != null ? duration(d.durationMs) : "Not run"}</td>
              <td data-label="Rows checked" className="num">{d.rowsChecked != null ? rows(d.rowsChecked) : "Not run"}</td>
              <td data-label="Audit chain">{d.status === "requested" ? <span className="muted">Not run</span> : <span className={`chip ${tone}`}>{text}</span>}</td>
              <td data-label="Result"><span className={`chip ${RESULT[d.status][0]}`}>{resultText(d)}</span><PinButton pin={pin} /></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
