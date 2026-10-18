import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { ExperienceView } from "../server/views";
import { art } from "./parts";

const stat = (label: string) => <PinButton pin={viewPin(label)} />;

// The mock's four stats, for the legal entities the viewer may see.
export function Tiles({ v }: { v: ExperienceView }) {
  const share = v.devices.total ? Math.round((1000 * v.devices.attention) / v.devices.total) / 10 : 0;
  const answered = v.pulse && v.pulse.recipients ? Math.round((100 * v.pulse.answers) / v.pulse.recipients) : 0;
  const waiting = v.fixes.filter((f) => f.status === "open").length;
  return (
    <div className="tickets four">
      <Ticket tone="info" label="Experience score" value={v.all.people ? v.all.score.toFixed(1) : "None yet"} progress={{ percent: v.all.score * 10, label: `Out of 10, all ${v.all.people} people` }} art={<>{art("chart")}{stat("Experience score")}</>} />
      <Ticket tone="attention" label="Devices needing attention" value={String(v.devices.attention)} note={`${share}% of ${v.devices.total} devices`} art={<>{art("shield")}{stat("Devices needing attention")}</>} />
      <Ticket tone="good" label="Pulse responses" value={v.pulse ? `${answered}%` : "No pulse yet"} progress={{ percent: answered, label: v.pulse ? `${v.pulse.answers} of ${v.pulse.recipients}, anonymous` : "Send one from here" }} art={<>{art("people")}{stat("Pulse responses")}</>} />
      <Ticket tone="problem" label="Fixes waiting" value={String(waiting)} note="Suggested by the experience agent" art={<>{art("headset")}{stat("Fixes waiting")}</>} />
    </div>
  );
}
