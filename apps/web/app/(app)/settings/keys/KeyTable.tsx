import { CONNECTORS, type CredentialRow } from "@amax/core/secrets";
import { expiringSoon, lastUsed, shortDate, statusChip } from "./format";

export function KeyTable({ rows, now }: { rows: CredentialRow[]; now: Date }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Connector credentials</caption>
      <thead><tr><th>Connector</th><th>Used for</th><th>Status</th><th>Last rotated</th><th>Expires</th><th>Last used</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="muted">No credentials yet. Add one for each connector you use.</td></tr>}
        {rows.map((r) => {
          const c = CONNECTORS[r.connector];
          const chip = statusChip(r, now);
          return (
            <tr key={r.connector}>
              <td data-label="Connector"><div className="who"><span className="logo-sq" style={{ background: c.color }} aria-hidden="true">{c.logo}</span>{c.name}</div></td>
              <td data-label="Used for">{c.usedFor}</td>
              <td data-label="Status"><span className={`chip ${chip.tone}`}>{chip.text}</span></td>
              <td data-label="Last rotated">{r.lastRotatedAt ? shortDate(r.lastRotatedAt, now) : "Never"}</td>
              <td data-label="Expires">{r.expiresAt && r.status !== "revoked" ? shortDate(r.expiresAt, now, true) : "None"}</td>
              <td data-label="Last used">{lastUsed(r, now)}</td>
              <td className="num">{r.status !== "revoked" && (
                <form method="get"><button className={`btn sm${expiringSoon(r, now) || r.status === "expired" ? " primary" : ""}`} name="rotate" value={r.connector} aria-label={`Rotate ${c.name}`}>Rotate</button></form>
              )}</td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
