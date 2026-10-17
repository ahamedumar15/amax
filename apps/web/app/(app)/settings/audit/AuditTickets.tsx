import type { AuditStatus } from "@amax/core/server";
import { PinButton, Ticket } from "@amax/ui";
import { chainNote, count } from "./format";

const STATUS = { label: "Audit and trace status", tool: "audit_status", args: {} };

function Pinned({ children }: { children: React.ReactNode }) {
  return <div className="pinnable audit-tile">{children}<PinButton pin={STATUS} /></div>;
}

const years = (until: string, from: string) => Math.round((Date.parse(until) - Date.parse(from)) / (365.25 * 86_400_000));

export function AuditTickets({ s }: { s: AuditStatus }) {
  const exp = s.lastExport;
  return (
    <div className="tickets four">
      <Pinned><Ticket tone={s.audit.ok ? "good" : "problem"} label="Audit chain" value={s.audit.ok ? "Verified" : "Broken"} note={chainNote(s.audit, s.verifiedAt)} /></Pinned>
      <Pinned><Ticket tone={s.trace.ok ? "good" : "problem"} label="Trace chain" value={s.trace.ok ? "Verified" : "Broken"} note={chainNote(s.trace, s.verifiedAt)} /></Pinned>
      <Pinned><Ticket tone="info" label="Write-once export" value={exp ? exp.day : "None yet"}
        note={exp ? `Exported ${exp.at.slice(0, 16).replace("T", " ")} UTC · locked for ${years(exp.retainUntil, exp.at)} years` : "Runs daily at 00:15 UTC"} /></Pinned>
      <Pinned><Ticket tone={s.deniedToday ? "attention" : "good"} label="Denied tool calls today" value={count(s.deniedToday)} note="Refused by a permission check" /></Pinned>
    </div>
  );
}
