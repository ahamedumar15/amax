import { facet, PinButton } from "@amax/ui";
import type { ActivityRow } from "../server/detail";
import { day, first, initials, itemPin, oppPin } from "./parts";

const KIND: Record<string, [string, string]> = { demo: ["info", "Demo"], proposal: ["agent", "Proposal"], workshop: ["", "Workshop"], call: ["", "Call"], meeting: ["", "Meeting"], email: ["", "Email"] };

export function ActivitiesCard({ opp, rows }: { opp: { id: string; number: string; title: string }; rows: ActivityRow[] }) {
  const { number } = opp;
  return (
    <div className="card flush pinnable" id="activities">
      <div className="card-head"><h2>Activities</h2><PinButton inline pin={facet(oppPin(opp), ", activities")} /><span className="muted">Log one in chat</span></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Activities</caption>
        <thead><tr><th>Activity</th><th>Type</th><th>Owner</th><th>Date</th><th style={{ minWidth: 140 }}>Progress</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="pinnable">
              <td><b>{a.title}</b>{a.note && <small>{a.note}</small>}</td>
              <td><span className={`chip ${KIND[a.kind][0]}`}>{KIND[a.kind][1]}</span></td>
              <td><div className="who"><span className="av sm a2" aria-hidden="true">{initials(a.ownerName)}</span>{first(a.ownerName)}</div></td>
              <td>{day(a.on)}</td>
              <td><div className="row"><div className="meter" style={{ flex: 1 }}><i style={{ width: `${a.progress}%`, background: a.progress === 100 ? "var(--mint)" : "var(--violet)" }} /></div>{a.progress === 100 ? "Done" : `${a.progress}%`}</div>
                <PinButton pin={itemPin(number, `activity: ${a.title}`, a.id)} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5}>No activities yet.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
