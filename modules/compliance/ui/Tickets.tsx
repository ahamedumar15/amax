import { PinButton, Ticket } from "@amax/ui";
import type { Overview } from "../server/overview";
import { compact, plural, shortDate } from "./parts";

const art = (name: string) => <svg className="art" viewBox="0 0 120 110" aria-hidden="true"><use href={`#cp-art-${name}`} /></svg>;
const stat = (label: string) => <PinButton pin={{ label, tool: "get_compliance_overview", args: {} }} />;
const time = (iso: string) => iso.slice(11, 16);

export function Tickets({ o }: { o: Overview }) {
  const { people, fullyAcknowledged } = o.coverage;
  const percent = people ? Math.round((fullyAcknowledged / people) * 100) : 100;
  const due = o.incidents.filter((i) => i.breach && !i.decision && i.status !== "resolved");
  const high = o.risks.filter((r) => r.level === "high").length, medium = o.risks.filter((r) => r.level === "medium").length;
  const c = o.chain;
  return (
    <div className="tickets four">
      <Ticket tone="attention" label="Policy acknowledged" value={`${percent}%`} progress={{ percent, label: `${fullyAcknowledged} of ${people} people` }} art={<>{art("people")}{stat("Policy acknowledged")}</>} />
      <Ticket tone="problem" label="Incident decisions due" value={String(due.length)} note={due[0]?.notifyBy ? `Decide by ${shortDate(due[0].notifyBy)}` : "Nothing to decide"} art={<>{art("shield")}{stat("Incident decisions due")}</>} />
      <Ticket tone="info" label="Open risks" value={String(o.risks.length)} note={`${high} high, ${medium} medium`} art={<>{art("target")}{stat("Open risks")}</>} />
      <Ticket tone={c && !c.ok ? "problem" : "good"} label={c && !c.ok ? "Audit chain broken" : "Audit chain verified"} value={c ? (c.ok ? time(c.checkedAt) : `#${c.brokenAt}`) : "Not yet"}
        note={c ? (c.ok ? (c.events ? `${compact(c.events)} events, no gaps` : "Nothing audited yet") : `${plural(c.events, "event")} verified before it`) : "Runs daily at 06:00 UTC"} art={<>{art("shield")}{stat("Audit chain")}</>} />
    </div>
  );
}
