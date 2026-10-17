import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { plural } from "./format";

type Props = { rules: number; due: { delete: number; anonymise: number }; open: { access: number; erasure: number }; holds: number; pausedRules: number };
const pin = (label: string, tool: string, args: Record<string, unknown> = {}) => ({ label, tool, args });

export function RetentionTickets({ rules, due, open, holds, pausedRules }: Props) {
  const requests = open.access + open.erasure;
  return (
    <div className="tickets four">
      <Ticket pin={pin("Retention rules", "list_retention_rules")} tone="info" label="Data classes covered" value={`${rules} of ${rules}`} progress={{ percent: 100, label: "Every personal-data table has a rule" }} />
      <Ticket pin={pin("Due tonight", "retention_overview")} tone="good" label="Due tonight" value={(due.delete + due.anonymise).toLocaleString("en")} note={`${due.delete.toLocaleString("en")} delete, ${due.anonymise.toLocaleString("en")} anonymise`} />
      <Ticket pin={pin("Open privacy requests", "list_privacy_requests", { status: "open" })} tone={requests ? "attention" : "good"} label="Open requests" value={String(requests)} note={`${plural(open.access, "access", "access")}, ${plural(open.erasure, "erasure", "erasure")}`} />
      <Ticket pin={pin("Legal holds", "list_legal_holds")} tone={holds ? "problem" : "good"} label="Legal holds" value={String(holds)} note={holds ? `Purge paused for ${plural(holds, "hold")}${pausedRules ? `, ${plural(pausedRules, "rule")}` : ""}` : "The purge runs for everyone"} />
    </div>
  );
}
