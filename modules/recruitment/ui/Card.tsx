import { PinButton } from "@amax/ui";
import { appPin } from "../pins";
import type { AppRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { day, Field, slot, tint } from "./parts";

function Foot({ a }: { a: AppRow }) {
  const score = a.stage === "applied" ? a.agentScore : a.matchScore;
  if (a.stage === "applied" || a.stage === "screening") return <div className="foot">{score !== null && <span className="chip agent">Match {score}%</span>}<span>{a.source}</span></div>;
  if (a.stage === "interview") return <div className="foot"><span>{a.roundsDone} of {a.rounds} rounds</span><span>{a.nextInterview ? slot(a.nextInterview) : "Next round to book"}</span></div>;
  if (a.stage === "offer") return <div className="foot"><span className="chip warn">Out for signature</span><span>Sent {a.offer ? day(a.offer.sentAt) : ""}</span></div>;
  const to = a.inHr ? "Onboarding" : a.hrConfirmed ? null : "HR to confirm";
  return (
    <div className="foot"><span className="chip good">Starts {a.offer ? day(a.offer.startsOn) : ""}</span>
      {to ? <span>{to}</span> : <AskButton label="Add to HR" pin={appPin(a)} name={`Ask amax to add ${typeof a.name === "string" ? a.name : "this hire"} to HR records`}
        prompt={`Add ${typeof a.name === "string" ? a.name : "this hire"} to HR records as ${a.roleTitle}, joining ${a.offer?.startsOn ?? ""}`} />}
    </div>
  );
}

// One candidate on the board. The name is the candidate's (002): •••• for anyone but HR.
export function AppCard({ a }: { a: AppRow }) {
  return (
    <div className="tcard" data-application={a.id}>
      <PinButton pin={appPin(a)} />
      <div className="cand"><span className={`av ${tint(a.id)}`} aria-hidden="true">{typeof a.initials === "string" ? a.initials : "••"}</span><p><Field v={a.name} /></p></div>
      {a.stage === "interview" && <div className="prog" role="img" aria-label={`${a.roundsDone} of ${a.rounds} interview rounds done`}><i style={{ width: `${Math.round((100 * a.roundsDone) / a.rounds)}%` }} /></div>}
      <Foot a={a} />
    </div>
  );
}
