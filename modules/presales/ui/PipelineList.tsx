import type { OpportunityRow } from "../server/queries";
import { money, StageChip, usd } from "./parts";

const HEALTH: Record<string, [string, string]> = { green: ["good", "Green"], amber: ["warn", "Amber"], red: ["bad", "Red"] };

export function PipelineList({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="card flush list-view">
      <div className="card-head"><h2>All opportunities</h2><span className="muted">{rows.length} in total, values in USD</span></div>
      <div className="scroll-x">
        <table className="tbl">
          <caption className="sr">All opportunities</caption>
          <thead><tr><th>Opportunity</th><th>Stage</th><th className="num">Value</th><th className="num">Win chance</th><th>Health</th><th>Owner</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} data-owner={o.ownerName ?? ""}>
                <td><a className="rowlink" href={`/presales/o/${o.number}`}><b>{o.title}</b></a><small>{o.number}, {o.client}</small></td>
                <td><StageChip stage={o.stage} /></td>
                <td className="num">{usd(o.valueUsd)}{o.valueCurrency !== "USD" && <small>{money(o.valueAmount, o.valueCurrency)}</small>}</td>
                <td className="num">{o.winChance}%</td>
                <td>{o.stage === "won" || o.stage === "lost" ? "–" : <span className={`chip ${HEALTH[o.health][0]}`}>{HEALTH[o.health][1]}</span>}</td>
                <td>{o.ownerName ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
