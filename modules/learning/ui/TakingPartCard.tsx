import { PinButton } from "@amax/ui";
import { certificationPin, viewPin } from "../pins";
import type { CertificationRow } from "../server/queries";
import type { LearningStats } from "../server/stats";
import { AskButton } from "./AskButton";
import { ParticipationChart } from "./ParticipationChart";
import { beforeNextYear, day, tint } from "./parts";

const ini = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function Expiring({ c, canRemind }: { c: CertificationRow; canRemind: boolean }) {
  const prompt = `Remind ${c.personName} that their ${c.name} certification expires on ${day(c.expiresOn!)}`;
  return (
    <li className="pinnable">
      <div className="l"><span className={`av sm ${tint(c.personId)}`} aria-hidden="true">{c.initials || ini(c.personName)}</span><div>{c.name}<small>{c.personName}, {day(c.expiresOn!)}</small></div></div>
      <PinButton inline pin={certificationPin(c)} />
      {canRemind && <AskButton label="Remind" prompt={prompt} pin={certificationPin(c)} name={`Ask amax to remind ${c.personName} about ${c.name}`} />}
    </li>
  );
}

export function TakingPartCard({ s, expiring, on, canRemind }: { s: LearningStats; expiring: CertificationRow[]; on: string; canRemind: boolean }) {
  return (
    <div className="card pinnable">
      <PinButton pin={viewPin("People taking part each month")} />
      <div className="card-head"><h2>People taking part</h2><span className="muted" style={{ fontSize: 13 }}>{s.year}</span></div>
      <ParticipationChart months={s.participation} label="People taking part in optional programmes each month" />
      <div className="hr" />
      <div className="row" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Expiring soon</h2><PinButton inline pin={viewPin(`Certifications expiring ${beforeNextYear(on)}`, "list_certifications")} /></div>
      <ul className="list">
        {expiring.map((c) => <Expiring key={c.id} c={c} canRemind={canRemind} />)}
        {!expiring.length && <li><p className="empty-line">No certification expires {beforeNextYear(on)}.</p></li>}
      </ul>
    </div>
  );
}
