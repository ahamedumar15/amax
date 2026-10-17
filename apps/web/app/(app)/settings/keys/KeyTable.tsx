import { CONNECTORS, type CredentialRow } from "@amax/core/secrets";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { lastRotated, lastUsed, shortDate, statusChip } from "./format";

function Ask({ r }: { r: CredentialRow }) {
  const c = CONNECTORS[r.connector];
  const pin = { label: c.name, tool: "get_secret_meta", args: { connector: r.connector } };
  if (r.status === "revoked") return <AskButton label="Ask amax" prompt={`Add a new ${c.name} ${c.noun}`} pin={pin} tool="put_secret" name={`Ask amax to add a new ${c.name} ${c.noun}`} />;
  return <AskButton label="Ask to rotate" prompt={`Rotate the ${c.name} ${c.noun}, keep its expiry`} pin={pin} tool="rotate_secret" name={`Ask to rotate ${c.name}`} />;
}

export function KeyTable({ rows, now }: { rows: CredentialRow[]; now: Date }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Connector credentials</caption>
      <thead><tr><th>Connector</th><th>Used for</th><th>Status</th><th>Last rotated</th><th>Expires</th><th>Last used</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="muted">No credentials yet. Ask amax to add one for each connector you use.</td></tr>}
        {rows.map((r) => {
          const c = CONNECTORS[r.connector];
          const chip = statusChip(r, now);
          return (
            <tr key={r.connector} className="pinnable">
              <td data-label="Connector"><div className="who"><span className="logo-sq" style={{ background: c.color }} aria-hidden="true">{c.logo}</span>{c.name}</div></td>
              <td data-label="Used for">{c.usedFor}</td>
              <td data-label="Status"><span className={`chip ${chip.tone}`}>{chip.text}</span></td>
              <td data-label="Last rotated">{lastRotated(r, now)}</td>
              <td data-label="Expires">{r.expiresAt && r.status !== "revoked" ? shortDate(r.expiresAt, now, true) : "None"}</td>
              <td data-label="Last used">{lastUsed(r, now)}</td>
              <td className="num"><Ask r={r} /><PinButton pin={{ label: c.name, tool: "get_secret_meta", args: { connector: r.connector } }} /></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
