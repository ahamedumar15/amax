import { EmptyState, PinButton } from "@amax/ui";
import type { ErrorRow } from "../server/views";
import { AskButton } from "./AskButton";
import { ERROR_CHIP, stamp } from "./parts";
import { dismissPrompt, subjectOf } from "./prompts";

const listPin = { label: "Keyflow sync errors", tool: "get_keyflow_sync", args: {} };

export function ErrorsCard({ errors, manage }: { errors: ErrorRow[]; manage: boolean }) {
  return (
    <div className="card flush pinnable section">
      <div className="card-head"><h2>Sync errors</h2><PinButton inline pin={listPin} /><span className="muted small">{errors.length} open</span></div>
      {errors.length === 0 ? <EmptyState icon="plug" title="No sync errors" hint="Records Keyflow refuses, or sends for someone amax doesn't know, show up here." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Open Keyflow sync errors</caption>
          <thead><tr><th>What</th><th>Record</th><th>First seen</th><th className="num">Runs</th><th className="num">Action</th></tr></thead>
          <tbody>
            {errors.map((e) => {
              const pin = { label: `Keyflow sync error, ${e.personName ?? e.externalRef}`, tool: "get_keyflow_sync_error", args: { errorId: e.id } };
              const [tone, label] = ERROR_CHIP[e.kind];
              return (
                <tr key={e.id} className="pinnable">
                  <td data-label="What"><span className={`chip ${tone}`}>{label}</span> {e.message}</td>
                  <td data-label="Record">{subjectOf(e)}</td>
                  <td data-label="First seen">{stamp(e.firstSeenAt)}</td>
                  <td className="num" data-label="Runs">{e.runs}</td>
                  <td className="num" data-label="">{manage && <AskButton label="Ask amax" name={`Ask amax about the sync error for ${subjectOf(e)}`} prompt={dismissPrompt(e)} pin={pin} />}<PinButton pin={pin} /></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
