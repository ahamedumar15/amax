import { CONNECTORS, EXPIRY_WINDOW_DAYS, type CredentialRow } from "@amax/core/secrets";
import { Ticket } from "@amax/ui";
import { Art } from "./Art";
import { expiringSoon, shortDate } from "./format";

const ROTATION_DAYS = 90;

function breakdown(rows: CredentialRow[]) {
  const n = (s: CredentialRow["status"]) => rows.filter((r) => r.status === s).length;
  return [[n("active"), "active"], [n("expired"), "expired"], [n("revoked"), "revoked"]].filter(([c], i) => i === 0 || Number(c) > 0).map(([c, s]) => `${c} ${s}`).join(", ");
}

export function KeyTickets({ rows, now }: { rows: CredentialRow[]; now: Date }) {
  const active = rows.filter((r) => r.status === "active");
  const soon = rows.filter((r) => expiringSoon(r, now)).sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  const fresh = active.filter((r) => r.lastRotatedAt && now.getTime() - r.lastRotatedAt.getTime() <= ROTATION_DAYS * 86_400_000).length;
  const pct = active.length ? Math.round((fresh / active.length) * 100) : 0;
  return (
    <div className="tickets four">
      <Ticket tone="info" label="Credentials" value={String(rows.length)} note={breakdown(rows)} art={<Art name="key" />} />
      <Ticket tone="attention" label={`Expiring in ${EXPIRY_WINDOW_DAYS} days`} value={String(soon.length)}
        note={soon.length ? soon.slice(0, 2).map((r) => `${CONNECTORS[r.connector].name}, ${shortDate(r.expiresAt!, now, false)}`).join("; ") : "Nothing due"} art={<Art name="calendar" />} />
      <Ticket tone="good" label={`Rotated in ${ROTATION_DAYS} days`} value={active.length ? `${fresh} of ${active.length}` : "0"}
        progress={active.length ? { percent: pct, label: `${pct}% of ${active.length} active` } : undefined} note={active.length ? undefined : "No active credentials"} art={<Art name="shield" />} />
      <Ticket tone="good" label="Values shown to anyone" value="0" note="Write-only, never displayed" art={<Art name="shield" />} />
    </div>
  );
}
