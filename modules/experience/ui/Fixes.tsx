import { PinButton } from "@amax/ui";
import { fixPin, suggestionPin, viewPin } from "../pins";
import { fixDetail, fixTitle, type Issue } from "../server/phrases";
import type { ExperienceView } from "../server/views";
import { AskButton } from "./AskButton";

const LOGO = { app: "#5059C9", boot: "#00A4EF", battery: "#00A4EF" } as const;
const review = (title: string) => `Review the experience agent's fix "${title}": show its evidence, then accept or dismiss it.`;
const ticket = (i: Issue, title: string) => `New IT ticket: ${title}. ${i.devices} devices; likely cause: ${i.cause}. Raised from the experience agent's accepted fix.`;

function Fix({ i, v, first }: { i: Issue; v: ExperienceView; first: boolean }) {
  const title = fixTitle(i);
  const open = i.status === "open";
  return (
    <li className="pinnable">
      <div className="l"><span className="logo-sq" style={{ background: LOGO[i.kind] }} aria-hidden="true">{i.subject[0].toUpperCase()}</span><div>{title}<small>{fixDetail(i, v.today)}</small></div></div>
      <div className="acts">
        {open && <AskButton className={`btn sm${first ? " primary" : ""}`} label="Review" name={`Review ${title}`} prompt={review(title)} pin={suggestionPin(title, i.suggestionId!)} />}
        {!open && i.fix === "ticket" && v.helpdesk && <AskButton label="Open ticket" name={`Open a helpdesk ticket for ${title}`} prompt={ticket(i, title)} intent="helpdesk.new-ticket" pin={fixPin({ id: i.id, fixTitle: title })} />}
        {!open && (i.fix === "remediation" || !v.helpdesk) && <span className="chip good">Accepted</span>}
      </div>
      <PinButton pin={fixPin({ id: i.id, fixTitle: title })} />
    </li>
  );
}

export function Fixes({ v }: { v: ExperienceView }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Suggested fixes</h2><span className="chip agent">Experience agent</span></div>
      {v.fixes.length ? <ul className="list">{v.fixes.map((i, k) => <Fix key={i.id} i={i} v={v} first={k === 0} />)}</ul>
        : <p className="muted">No issue affects 5 or more devices.<PinButton pin={viewPin("Suggested fixes")} /></p>}
    </div>
  );
}
