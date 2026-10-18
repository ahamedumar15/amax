import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { LearningStats } from "../server/stats";
import { beforeNextYear, plural } from "./parts";

const pin = (label: string) => <PinButton pin={viewPin(label)} />;

function TargetTicket({ rate, target }: { rate: number; target: number }) {
  return (
    <div className={`ticket ${rate >= target ? "good" : "attention"}`}>
      <div className="k">Completion rate</div>
      <div className="v">{rate}%</div>
      {pin("Completion rate")}
      <div className="p">{rate}%, against an {target}% target
        <div className="bar" role="img" aria-label={`${rate}% completed, target ${target}%`}><i style={{ width: `${Math.min(100, rate)}%` }} /><b style={{ left: `${target}%` }} /></div>
      </div>
    </div>
  );
}

export function Tickets({ s, on }: { s: LearningStats; on: string }) {
  const expiring = s.certifications.expiringThisYear;
  return (
    <div className="tickets four">
      <Ticket tone="info" label="Programmes" art={pin("Programmes")} value={String(s.programmes.total)} note={`${s.programmes.internal} internal, ${s.programmes.external} external`} />
      <Ticket tone="info" label="People in optional programmes" art={pin("People in optional programmes")} value={String(s.optional.people)}
        progress={{ percent: s.optional.share, label: `${s.optional.share}% of ${plural(s.headcount, "person", "people")}` }} />
      <TargetTicket rate={s.completion.rate} target={s.completion.target} />
      <Ticket tone={expiring ? "attention" : "info"} label="Certifications" art={pin("Certifications")} value={String(s.certifications.valid)}
        note={expiring ? `${expiring} expire${expiring === 1 ? "s" : ""} ${beforeNextYear(on)}` : `None expire ${beforeNextYear(on)}`} />
    </div>
  );
}
