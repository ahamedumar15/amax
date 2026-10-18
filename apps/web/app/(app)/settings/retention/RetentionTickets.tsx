import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { plural } from "./format";

type Props = { rules: number; unchecked: string[]; due: { delete: number; anonymise: number }; open: { access: number; erasure: number }; holds: number; pausedRules: number };
const pin = (label: string, tool: string, args: Record<string, unknown> = {}) => ({ label, tool, args });

export function RetentionTickets({ rules, unchecked, due, open, holds, pausedRules }: Props) {
  const requests = open.access + open.erasure;
  // Rules tonight's purge could count, out of all of them: a rule that failed is unknown, not 0, and a
  // gap shows here (review 058 B3). Never a count of the rules against themselves.
  const checked = rules - unchecked.length;
  return (
    <div className="tickets four">
      <Ticket pin={pin("Retention rules", "list_retention_rules")} tone={unchecked.length ? "problem" : "info"} label="Rules checked tonight" value={`${checked} of ${rules}`}
        progress={{ percent: rules ? Math.round((checked / rules) * 100) : 100, label: unchecked.length ? `Could not check ${unchecked.join(", ")}` : "Every rule could be checked" }} />
      <Ticket pin={pin("Due tonight", "retention_overview")} tone={unchecked.length ? "attention" : "good"} label="Due tonight" value={`${(due.delete + due.anonymise).toLocaleString("en")}${unchecked.length ? "+" : ""}`}
        note={`${due.delete.toLocaleString("en")} delete, ${due.anonymise.toLocaleString("en")} anonymise${unchecked.length ? `, ${plural(unchecked.length, "rule")} unknown` : ""}`} />
      <Ticket pin={pin("Open privacy requests", "list_privacy_requests", { status: "open" })} tone={requests ? "attention" : "good"} label="Open requests" value={String(requests)} note={`${plural(open.access, "access", "access")}, ${plural(open.erasure, "erasure", "erasure")}`} />
      <Ticket pin={pin("Legal holds", "list_legal_holds")} tone={holds ? "problem" : "good"} label="Legal holds" value={String(holds)} note={holds ? `Purge paused for ${plural(holds, "hold")}${pausedRules ? `, ${plural(pausedRules, "rule")}` : ""}` : "The purge runs for everyone"} />
    </div>
  );
}
