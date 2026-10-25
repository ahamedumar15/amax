import type { ChangeRequest } from "../server/requests-read";
import { MyRequest } from "./MyRequest";
import { ReviewRequest } from "./ReviewRequest";

// 077: a week's decided change requests, kept: folded under the week's open requests, closed until opened. The owner
// sees their own (as on My timesheet); a reviewer sees that person's (as on Team time). Absent when there are none.
export function RequestHistory({ rows, viewerId, as }: { rows: ChangeRequest[]; viewerId: string; as: "owner" | "reviewer" }) {
  if (!rows.length) return null;
  return (
    <details className="card rq-history">
      <summary><span className="rq-chev" aria-hidden="true" /><b>History</b><span className="muted">{rows.length} decided {rows.length === 1 ? "request" : "requests"} on this week</span></summary>
      {as === "owner"
        ? <div className="rq-group">{rows.map((r) => <MyRequest key={r.id} r={r} open={false} />)}</div>
        : <ul className="rq-list">{rows.map((r) => <ReviewRequest key={r.id} r={r} viewerId={viewerId} open={false} />)}</ul>}
    </details>
  );
}
