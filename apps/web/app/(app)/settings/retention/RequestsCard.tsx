import type { RequestView } from "@amax/core/privacy";
import { EmptyState, PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { initials, requestNote, requestTitle } from "./format";

type Props = { requests: RequestView[]; names: Record<string, string> };

function Action({ r }: { r: RequestView }) {
  const pin = { label: requestTitle(r), tool: "get_privacy_request", args: { id: r.id } };
  if (r.status === "open") return <AskButton primary small label="Ask to approve" prompt={`Approve the ${r.kind} request for ${r.subjectLabel}`} pin={pin} tool="complete_privacy_request" name={`Ask to approve the ${r.kind} request for ${r.subjectLabel}`} />;
  if (r.kind === "access") return <AskButton label="Ask for the package" prompt={`Get the access package for ${r.subjectLabel}`} pin={pin} tool="get_access_package" name={`Ask for ${r.subjectLabel}'s access package`} />;
  return null;
}

export function RequestsCard({ requests, names }: Props) {
  const waiting = requests.filter((r) => r.status === "open").length;
  const shown = requests.slice(0, 6);
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Requests</h2><PinButton inline pin={{ label: "Privacy requests", tool: "list_privacy_requests", args: {} }} />{waiting > 0 && <span className="chip warn">{waiting} need{waiting === 1 ? "s" : ""} approval</span>}</div>
      {shown.length === 0 ? <EmptyState icon="people" title="No access or erasure requests" hint="Ask amax to open one for a person." /> : (
        <ul className="list">
          {shown.map((r, i) => (
            <li key={r.id}>
              <div className="l"><span className={`av sm ${i % 2 ? "a3" : "a4"}`} aria-hidden="true">{initials(r.subjectLabel)}</span><div>{requestTitle(r)}<small>{requestNote(r, names[r.openedBy] ?? "someone")}</small></div></div>
              <div className="r"><Action r={r} /><PinButton inline pin={{ label: requestTitle(r), tool: "get_privacy_request", args: { id: r.id } }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
