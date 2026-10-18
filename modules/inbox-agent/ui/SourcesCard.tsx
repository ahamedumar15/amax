import { EmptyState, PinButton } from "@amax/ui";
import { sourcePin, viewPin } from "../pins";
import type { SourceRow } from "../server/rows";
import { shortDate } from "./parts";

// 025 AC-1: the allow-list. The agent reads these and nothing else; changing it happens in chat.
export function SourcesCard({ sources }: { sources: SourceRow[] }) {
  return (
    <div className="card flush pinnable section">
      <div className="card-head"><h2>Allowed channels and mailboxes</h2><PinButton inline pin={viewPin("Inbox agent allow-list")} /><span className="muted small">Read only from the day they were allowed</span></div>
      {sources.length === 0 ? <EmptyState icon="plug" title="Nothing is allowed yet" hint="Ask amax to allow a Teams channel or a mailbox. The agent reads nothing else." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Teams channels and mailboxes the inbox agent may read</caption>
          <thead><tr><th>Source</th><th>Kind</th><th>Acts for</th><th>Allowed</th><th className="num">Finds</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="pinnable">
                <td data-label="Source"><b>{s.label}</b>{s.kind === "mailbox" && s.label !== s.address && <small className="muted block">{s.address}</small>}</td>
                <td data-label="Kind"><span className="chip">{s.kind === "mailbox" ? "Mailbox" : "Teams channel"}</span></td>
                <td data-label="Acts for">{s.actsForName ?? "Unknown person"}</td>
                <td data-label="Allowed">{shortDate(s.allowedAt)}</td>
                <td className="num" data-label="Finds">{s.finds}<PinButton pin={sourcePin(s)} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
