import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { HelpdeskView } from "../server/views";

// The mock's four stats, across the queues the viewer works in.
export function Tiles({ v }: { v: HelpdeskView }) {
  const s = v.stats;
  const pin = (label: string) => <PinButton pin={viewPin(label)} />;
  const points = s.agentSharePoints === null ? "First month" : s.agentSharePoints === 0 ? "Same as last month" : `${s.agentSharePoints > 0 ? "Up" : "Down"} ${Math.abs(s.agentSharePoints)} points on ${v.lastMonth}`;
  const fast = s.firstResponseMinutes !== null && s.responseTarget !== null && s.firstResponseMinutes <= s.responseTarget;
  return (
    <div className="tickets four">
      <Ticket tone={v.breached ? "problem" : "attention"} label="Open tickets" value={String(s.open)} note={`${s.waiting} waiting on the requester`} art={pin("Open tickets")} />
      <Ticket tone="good" label="Solved by agent" value={`${s.agentShare}%`} note={points} art={pin("Solved by the support agent")} />
      <Ticket tone={fast ? "good" : "attention"} label="First response" value={s.firstResponseMinutes === null ? "None yet" : `${s.firstResponseMinutes} min`}
        note={s.responseTarget === null ? "No target set" : `Target ${s.responseTarget} min`} art={pin("First response")} />
      <Ticket tone="good" label="Satisfaction" value={s.satisfaction === null ? "No ratings" : `${s.satisfaction} / 5`} note={`${s.ratings} rating${s.ratings === 1 ? "" : "s"}`} art={pin("Satisfaction")} />
    </div>
  );
}
