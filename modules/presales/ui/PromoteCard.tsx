import { PinButton } from "@amax/ui";
import type { OpportunityRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { oppPin } from "./parts";

const suggestKey = (client: string) => (client.replace(/[^A-Za-z ]/g, "").split(/\s+/).map((w) => w[0]).join("").toUpperCase() + client.replace(/[^A-Za-z]/g, "").toUpperCase()).slice(0, 3).padEnd(2, "X");

export function PromoteCard({ o, why }: { o: OpportunityRow; why: string }) {
  const pin = oppPin(o);
  if (o.projectKey) return <div className="card pinnable"><PinButton pin={pin} /><h2>Delivered as a project</h2><p className="muted">Promoted to delivery as {o.projectKey}.</p><a className="btn" href={`/delivery/p/${o.projectKey}`}>Open the project</a></div>;
  return (
    <div className="card pinnable">
      <PinButton pin={{ ...pin, label: `${o.number} promotion` }} />
      <h2>Ready to deliver?</h2>
      <p className="muted">When it&apos;s won, promote it to a delivery project. The client, cost centre, team and estimate carry over.</p>
      {why ? <button className="btn primary wide" type="button" disabled title={why} aria-describedby="promoteWhy">Promote to delivery</button>
        : <AskButton className="btn primary wide" label="Promote to delivery" pin={pin} prompt={`Promote ${o.number} to delivery as project ${suggestKey(o.client)}, fixed price`} />}
      {why && <p className="src" id="promoteWhy">{why}</p>}
    </div>
  );
}
