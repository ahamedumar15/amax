import { PinButton } from "@amax/ui";
import type { ControlStatus } from "../server/overview";
import type { PolicySummary } from "../server/policy-read";
import { AskButton } from "./AskButton";
import { CHECK_PROMPT } from "./prompts";

const overview = (label: string) => ({ label, tool: "get_compliance_overview", args: {} });
const chainPin = { label: "Audit-chain checks", tool: "list_audit_chain_checks", args: {} };

export function Policies({ rows }: { rows: PolicySummary[] }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Policies</h2><PinButton inline pin={overview("Policies")} /></div>
      {rows.map((p) => {
        const pin = { label: `${p.title} v${p.version}`, tool: "get_policy", args: { policyId: p.id } };
        return (
          <div key={p.id} className="row line pinnable">
            <span>{p.title} v{p.version}</span>
            <b className={p.pending ? "warn-t" : undefined}>{p.pending ? `${p.pending} pending` : "All acknowledged"}</b><PinButton pin={pin} />
          </div>
        );
      })}
    </div>
  );
}

export function Evidence({ rows, manage }: { rows: ControlStatus[]; manage: boolean }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Evidence ready</h2><PinButton inline pin={overview("Evidence ready")} /><span className="muted" style={{ fontSize: 13 }}>ISO 27001 Annex A</span></div>
      {rows.map((c) => (
        <div key={c.control} className="row line pinnable">
          <span>{c.control} {c.title}</span>
          <b className={c.ready ? undefined : c.control === "A.8.15" ? "bad-t" : "warn-t"}>{c.status}
            {c.control === "A.8.15" && manage && <AskButton className="btn sm ghost" label="Check now" name="Ask amax to verify the audit chain now" prompt={CHECK_PROMPT} pin={chainPin} spark={false} />}
          </b>
          <PinButton pin={c.control === "A.8.15" ? chainPin : overview(`${c.control} ${c.title}`)} />
        </div>
      ))}
    </div>
  );
}
