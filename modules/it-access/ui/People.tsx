import { PinButton } from "@amax/ui";
import { accountPin, viewPin } from "../pins";
import type { PersonRow } from "../server/rows";
import type { AccessView } from "../server/view";
import { AskButton } from "./AskButton";
import { dayMonth, initials, monthYear, tint } from "./parts";
import { PeopleFilter } from "./PeopleFilter";

const SHOWN = 12;
const holds = (p: PersonRow) => p.licences + p.entraGroups + p.adminRoles.length > 0;

function Roles({ p }: { p: PersonRow }) {
  if (p.status === "left") return <span className="muted">Left {p.leftOn ? dayMonth(p.leftOn) : ""}</span>;
  return p.adminRoles.length ? <>{p.adminRoles.map((r) => <span key={r} className="chip warn">{r}</span>)}</> : <span className="muted">None</span>;
}

function Review({ p }: { p: PersonRow }) {
  if (p.status === "left") return holds(p) ? <span className="chip warn">Still has access</span> : <span className="chip good">All revoked</span>;
  if (p.kind === "contractor" && p.expiresOn) return <span className="chip warn">Expires {dayMonth(p.expiresOn)}</span>;
  return <>{p.reviewedOn ? monthYear(p.reviewedOn) : <span className="muted">Never</span>}</>;
}

function Action({ p }: { p: PersonRow }) {
  const pin = accountPin(p);
  if (p.status === "left") return null;
  if (p.kind === "contractor") return <AskButton label="Extend" pin={pin} name={`Extend ${p.name}'s access with amax`} prompt={`Extend ${p.name}'s access: ask me for the new last day, then extend it`} />;
  if (p.adminRoles.length) return <AskButton label="Review" pin={pin} name={`Review ${p.name}'s access with amax`} prompt={`Review ${p.name}'s access and admin roles; record the review if I keep them, or ask IT to remove what isn't needed`} />;
  return <AskButton label="Open" pin={pin} name={`Open ${p.name}'s access with amax`} prompt={`Show ${p.name}'s access: Entra groups, licences, devices and the changes IT approved`} />;
}

// People and access: who needs attention first (admins, contractors, leavers), then everyone else.
export function People({ v, all }: { v: AccessView; all: boolean }) {
  const rows = all ? v.people : v.people.slice(0, SHOWN);
  const more = `/it-access?${new URLSearchParams({ ...(v.filter !== "everyone" ? { people: v.filter } : {}), all: "1" })}#people`;
  return (
    <div className="card flush pinnable people" id="people">
      <div className="card-head"><h2>People and access</h2><div className="actions"><PeopleFilter at={v.filter} /></div><PinButton pin={viewPin("People and access", v.filter)} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Person</th><th className="num">Entra groups</th><th className="num">Licences</th><th className="num">Devices</th><th>Admin roles</th><th>Last review</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.accountId} className="pinnable" data-account={p.accountId}>
            <td><div className="who"><span className={`av sm ${tint(p.accountId)}`} aria-hidden="true">{initials(p.name)}</span>{p.name}</div></td>
            <td className="num">{p.entraGroups}</td><td className="num">{p.licences}</td><td className="num">{p.devices}</td>
            <td><Roles p={p} /></td><td><Review p={p} /></td>
            <td className="num"><Action p={p} /><PinButton pin={accountPin(p)} /></td>
          </tr>))}
        </tbody></table></div>
      {!rows.length && <p className="foot-note">No one matches this filter.</p>}
      {!all && v.people.length > SHOWN && <p className="foot-note"><a href={more}>Show all {v.people.length}</a></p>}
    </div>
  );
}
