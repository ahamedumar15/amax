import { PinButton } from "@amax/ui";
import type { OpportunityRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { day, initials, money, oppPin, usd } from "./parts";

const KIND: Record<string, string> = { call: "Call", meeting: "Meeting", workshop: "Workshop", demo: "Demo", proposal: "Proposal", email: "Email" };
const HEALTH: Record<string, string> = { green: "Health: green", amber: "Health: amber", red: "Health: red" };
const RAG: Record<string, string> = { green: "g", amber: "a", red: "r" };

function Foot({ o }: { o: OpportunityRow }) {
  if (o.stage === "won") return o.projectKey ? <a className="link" href={`/delivery/p/${o.projectKey}`}>Now a project ›</a> : <span>Won</span>;
  if (o.stage === "lost") return <span>Lost on {(o.lostReason ?? "").toLowerCase()}</span>;
  if (o.next) return <span>{KIND[o.next.kind]} {day(o.next.on)}</span>;
  return <span>{o.expectedClose ? `Close ${day(o.expectedClose)}` : "No close date"}</span>;
}

export function DealCard({ o, canMove, canRemove }: { o: OpportunityRow; canMove: boolean; canRemove: boolean }) {
  const closed = o.stage === "won" || o.stage === "lost";
  const name = `${o.client}, ${o.title}`;
  return (
    <div className={`tcard deal pinnable${o.stage === "lost" ? " lost" : ""}`} data-owner={o.ownerName ?? ""}>
      <PinButton pin={oppPin(o)} />
      <div className="opp-top">
        <span className="id">{o.client}</span>
        {o.stage === "won" ? <span className="chip good">Won</span> : o.stage === "lost" ? <span className="chip bad">Lost</span>
          : <span className={`rag ${RAG[o.health]}`} title={HEALTH[o.health]} role="img" aria-label={HEALTH[o.health]} />}
      </div>
      <p><a className="rowlink" href={`/presales/o/${o.number}`}>{o.title}</a></p>
      <div className="opp-num">
        <b>{usd(o.valueUsd)}{o.valueCurrency !== "USD" && <small className="orig"> {money(o.valueAmount, o.valueCurrency)}</small>}</b>
        <span>{o.stage === "won" ? `Won ${day(o.closedAt)}` : o.stage === "lost" ? day(o.closedAt) : `${o.winChance}%`}</span>
      </div>
      <div className="foot"><span className="av sm a2" title={o.ownerName ?? undefined}>{initials(o.ownerName)}</span><Foot o={o} /></div>
      {!closed && canMove && (
        <div className="opp-act">
          <AskButton label="Move" name={`Ask amax to move ${name}`} prompt={`Move ${o.number} to `} pin={oppPin(o)} />
          {canRemove && <AskButton className="btn sm ghost" label="Remove" name={`Ask amax to remove ${name}`} prompt={`Remove ${o.number}, it was a duplicate or a mistake`} pin={oppPin(o)} />}
        </div>
      )}
    </div>
  );
}
