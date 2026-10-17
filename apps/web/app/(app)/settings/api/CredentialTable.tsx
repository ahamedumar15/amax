import type { CredentialView } from "@amax/auth/credentials-read";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { actsFor, expires, lastUsed } from "./format";

const scopeTone = (s: string) => (s.endsWith(":read") ? "" : s.endsWith(":sensitive") ? "warn" : "info");

function Ask({ r }: { r: CredentialView }) {
  const pin = { label: r.name, tool: "get_api_credential", args: { id: r.id } };
  if (r.status === "revoked") return null;
  if (r.status === "expired") return <AskButton label="Ask to revoke" prompt={`Revoke ${r.name}, it's unused`} pin={pin} tool="revoke_api_credential" name={`Ask to revoke ${r.name}`} />;
  return <AskButton label="Ask to rotate" prompt={`Rotate the key for ${r.name}`} pin={pin} tool="rotate_api_credential" name={`Ask to rotate ${r.name}`} />;
}

export function CredentialTable({ rows, now }: { rows: CredentialView[]; now: Date }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Service credentials</caption>
      <thead><tr><th>Name</th><th>Owner</th><th>Scopes</th><th>Acts for</th><th>Expires</th><th>Last used</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="muted">No service credentials yet. Ask amax to create one for each CI pipeline or tool.</td></tr>}
        {rows.map((r) => {
          const e = expires(r, now);
          return (
            <tr key={r.id} className="pinnable">
              <td data-label="Name"><b>{r.name}</b></td>
              <td data-label="Owner">{r.owner}</td>
              <td data-label="Scopes">{r.scopes.map((s) => <span key={s} className={`chip ${scopeTone(s)}`}>{s.replace(":", ": ")}</span>)}</td>
              <td data-label="Acts for">{actsFor(r.actsFor)}</td>
              <td data-label="Expires">{e.tone ? <span className={`chip ${e.tone}`}>{e.text}</span> : e.text}</td>
              <td data-label="Last used">{lastUsed(r.lastUsedAt, now)}</td>
              <td className="num"><Ask r={r} /><PinButton pin={{ label: r.name, tool: "get_api_credential", args: { id: r.id } }} /></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
