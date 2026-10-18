import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton } from "@amax/ui";
import { MANAGE, REPORT } from "../server/context";
import { complianceOverview, type Overview } from "../server/overview";
import { ART_SPRITE } from "./art";
import { AskButton } from "./AskButton";
import { Incidents } from "./Incidents";
import { shortDate, SignInFirst, viewerOrNull } from "./parts";
import { EXPORT_PROMPT } from "./prompts";
import { Risks, Suppliers } from "./Registers";
import { Evidence, Policies } from "./Side";
import { Tickets } from "./Tickets";

const capital = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** What needs attention first: policies still to acknowledge, breach decisions due, a broken audit chain. */
export function lede(o: Overview) {
  const parts: string[] = [];
  const top = o.coverage.policies.find((p) => p.pending);
  if (top) parts.push(`${top.pending} ${top.pending === 1 ? "person still needs" : "people still need"} to acknowledge the ${top.version > 1 ? "updated " : ""}${top.title} policy`);
  const due = o.incidents.filter((i) => i.breach && !i.decision && i.status !== "resolved");
  if (due.length) parts.push(`${due.length === 1 ? "one possible data breach needs a decision" : `${due.length} possible data breaches need decisions, the first`} by ${shortDate(due[0].notifyBy!)}`);
  if (o.chain && !o.chain.ok) parts.push(`the audit log no longer verifies at event ${o.chain.brokenAt}`);
  if (!parts.length) return "Every policy is acknowledged, no breach decision is due and the audit log verifies.";
  return `${capital(parts.slice(0, -1).join(", ") + (parts.length > 1 ? ", and " : "") + parts[parts.length - 1])}.`;
}

export async function CompliancePage({ viewer: raw }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="compliance"><h1>Compliance</h1><SignInFirst /></div>;
  const o = await complianceOverview(viewer);
  const manage = canEver(viewer, MANAGE);
  return (
    <div className="compliance">
      <div dangerouslySetInnerHTML={{ __html: ART_SPRITE }} />
      <div className="row head">
        <div><h1>Compliance</h1><p className="lede">{lede(o)}</p></div>
        <div className="actions">
          {manage && <AskButton className="btn" label="Export evidence" prompt={EXPORT_PROMPT} pin={{ label: "Evidence ready", tool: "get_compliance_overview", args: {} }} spark={false} />}
          {canEver(viewer, REPORT) && <IntentButton intent="compliance.report-incident" label="Report incident" />}
        </div>
      </div>
      <Tickets o={o} />
      <div className="cols">
        <Incidents rows={o.incidents} />
        <div className="stack">
          <Policies rows={o.coverage.policies} />
          <Evidence rows={o.controls} manage={manage} />
        </div>
      </div>
      <div className="cols even">
        <Risks rows={o.risks} manage={manage} />
        <Suppliers rows={o.suppliers} />
      </div>
    </div>
  );
}
