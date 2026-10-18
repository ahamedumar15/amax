import { EmptyState, PinButton } from "@amax/ui";
import type { RunRow } from "../server/views";
import { plural, RUN_CHIP, stamp } from "./parts";

const listPin = { label: "Recent Keyflow sync runs", tool: "get_keyflow_sync", args: {} };
const out = (r: RunRow) => [r.peopleOut && plural(r.peopleOut, "person", "people"), r.teamsOut && plural(r.teamsOut, "team")].filter(Boolean).join(", ") || "0";

export function RunsCard({ runs }: { runs: RunRow[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Recent runs</h2><PinButton inline pin={listPin} /><span className="muted small">Started by the keyflow.sync job</span></div>
      {runs.length === 0 ? <EmptyState icon="plug" title="No sync runs yet" hint="The first run starts within 15 minutes of connecting Keyflow." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Recent Keyflow sync runs</caption>
          <thead><tr><th>Started</th><th>Result</th><th className="num">Out</th><th className="num">In</th><th className="num">Errors</th></tr></thead>
          <tbody>
            {runs.map((r) => {
              const [tone, label] = RUN_CHIP[r.status];
              return (
                <tr key={r.id} className="pinnable">
                  <td data-label="Started">{stamp(r.startedAt)}</td>
                  <td data-label="Result"><span className={`chip ${tone}`}>{label}</span>{r.failure && <> {r.failure}</>}</td>
                  <td className="num" data-label="Out">{out(r)}</td>
                  <td className="num" data-label="In">{r.goalsIn + r.reviewsIn + r.recognitionIn}</td>
                  <td className="num" data-label="Errors">{r.errors}<PinButton pin={{ label: `Keyflow sync, ${stamp(r.startedAt)}`, tool: "get_keyflow_sync_run", args: { runId: r.id } }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
