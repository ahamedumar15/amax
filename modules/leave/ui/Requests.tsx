import { EmptyState, PinButton } from "@amax/ui";
import type { PendingRow } from "../server/pending";
import { AskButton } from "./AskButton";
import { avatar, initials } from "./parts";
import { approveAllPrompt, approvePrompt, decidePrompt } from "./prompts";

const rowPin = (r: PendingRow) => ({ label: `${r.personName}, ${r.label.toLowerCase()} leave ${r.dates}`, tool: "get_leave_request", args: { requestId: r.id } });
const listPin = { label: "Requests waiting for you", tool: "get_leave_overview", args: {} };

export function Requests({ rows }: { rows: PendingRow[] }) {
  const clear = rows.filter((r) => !r.clashes.length);
  return (
    <div className="card flush pinnable">
      <div className="card-head">
        <h2>Requests waiting for you</h2><PinButton inline pin={listPin} />
        {clear.length > 0 && <AskButton className="btn primary" label={`Approve ${clear.length} with no clash`} prompt={approveAllPrompt(clear)} pin={listPin} />}
      </div>
      {rows.length === 0 ? <EmptyState icon="calendar" title="No requests waiting for you" hint="New requests from your team show up here, with a check against releases in flight." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Leave requests waiting for your decision</caption>
          <thead><tr><th>Person</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>Clash check</th><th className="num">Action</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="pinnable">
                <td data-label="Person"><div className="who"><span className={`av sm ${avatar(r.personName)}`} aria-hidden="true">{initials(r.personName)}</span>{r.personName}</div></td>
                <td data-label="Type">{r.label}</td>
                <td data-label="Dates">{r.dates}</td>
                <td className="num" data-label="Days">{r.days}</td>
                <td data-label="Clash check">{r.clashes.length ? r.clashes.map((c) => <span key={c} className="chip warn">{c}</span>) : <span className="chip good">No clash</span>}</td>
                <td className="num" data-label="">
                  {r.clashes.length
                    ? <AskButton label="Ask amax" name={`Ask amax about ${r.personName}'s request`} prompt={decidePrompt(r)} pin={rowPin(r)} />
                    : <AskButton className="btn sm ghost" label="Approve" name={`Approve ${r.personName}'s request`} prompt={approvePrompt(r)} pin={rowPin(r)} />}
                  <PinButton pin={rowPin(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
