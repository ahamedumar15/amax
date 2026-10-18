import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { PipelineView } from "../server/queries";
import { plural } from "./parts";

function faster(now: number | null, was: number | null, label: string) {
  if (now === null) return "No hires yet this quarter";
  if (was === null) return `No hires in ${label} to compare`;
  return now <= was ? `${plural(was - now, "day")} faster than ${label}` : `${plural(now - was, "day")} slower than ${label}`;
}

// The four stats from the mock: open roles, candidates, time to hire and offers accepted.
export function Tiles({ p }: { p: PipelineView }) {
  const s = p.stats;
  const roleId = p.role?.id;
  const pin = (what: string) => <PinButton pin={viewPin(what, roleId)} />;
  const pct = s.offers ? Math.round((100 * s.offersAccepted) / s.offers) : 0;
  return (
    <div className="tickets four">
      <Ticket tone="info" label="Open roles" art={pin("Open roles")} value={String(s.openings)} note={s.fromDemand ? `${s.fromDemand} raised from demand forecasts` : "Raised by HR"} />
      <Ticket tone="info" label="Candidates" art={pin("Candidates this quarter")} value={String(s.candidates)} note={`${s.screened} screened by the agent`} />
      <Ticket tone="good" label="Time to hire" art={pin("Time to hire")} value={s.timeToHire === null ? "None yet" : plural(s.timeToHire, "day")} note={faster(s.timeToHire, s.previousTimeToHire, p.quarter.prevLabel)} />
      <Ticket tone="good" label="Offers accepted" art={pin("Offers accepted")} value={s.offers ? `${pct}%` : "None yet"}
        progress={{ percent: pct, label: `${s.offersAccepted} of ${plural(s.offers, "offer")} accepted this quarter` }} />
    </div>
  );
}
