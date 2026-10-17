import { promoteAction } from "../actions";
import type { OpportunityRow } from "../server/queries";

const suggestKey = (client: string) => (client.replace(/[^A-Za-z ]/g, "").split(/\s+/).map((w) => w[0]).join("").toUpperCase() + client.replace(/[^A-Za-z]/g, "").toUpperCase()).slice(0, 3).padEnd(2, "X");

// Promote to delivery: available once won, when delivery's contract offers project creation and the
// viewer may create projects. The client, cost centre, team and estimate carry over on the event.
export function PromoteCard({ o, available, why }: { o: OpportunityRow; available: boolean; why: string }) {
  if (o.projectKey) return <div className="card"><h2>Delivered as a project</h2><p className="muted">Promoted to delivery as {o.projectKey}.</p><a className="btn" href={`/delivery/p/${o.projectKey}`}>Open the project</a></div>;
  return (
    <div className="card">
      <h2>Ready to deliver?</h2>
      <p className="muted">When it&apos;s won, promote it to a delivery project. The client, cost centre, team and estimate carry over.</p>
      {available ? (
        <form className="form flush" action={promoteAction}>
          <input type="hidden" name="number" value={o.number} />
          <div className="two"><label>Project key<input name="key" required pattern="[A-Za-z][A-Za-z0-9]{1,9}" defaultValue={suggestKey(o.client)} /></label>
            <label>Billing<select className="select" name="billing" defaultValue="fixed"><option value="fixed">Fixed price</option><option value="t&m">Time and materials</option><option value="retainer">Retainer</option></select></label></div>
          <button className="btn primary wide" type="submit">Promote to delivery</button>
        </form>
      ) : <button className="btn primary wide" type="button" disabled title={why} aria-describedby="promoteWhy">Promote to delivery</button>}
      {!available && <p className="src" id="promoteWhy">{why}</p>}
    </div>
  );
}
