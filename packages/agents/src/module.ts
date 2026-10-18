import type { RetentionEntry } from "@amax/core";
import { agentsTools } from "./mcp";
import { agentRun } from "./run";
import { DECIDE, READ, SUGGEST } from "./store";

// 032: decisions and who made them are kept a year after the decision, or a year after a suggestion
// went untouched; the audit chain keeps the accountability for longer.
export const agentsRetention: RetentionEntry[] = [
  {
    table: "agents.suggestion", label: "Agent suggestions", class: "personal", period: "P1Y", start: { at: ["decided_at", "undone_at"], idle: "P1Y" }, action: "delete",
    subject: ["acts_for", "first_approved_by", "decided_by", "undone_by"],
    fields: ["acts_for", "first_approved_by", "decided_by", "undone_by", "query_note", "source_label", "proposed", "evidence"],
  },
];

const EVERYONE = [READ, DECIDE, SUGGEST];

/** The platform's suggestions surface (006): everyone may read and decide within their own scope per kind. */
export const agentsPlatform = {
  id: "suggestions",
  grants: { ITAdmin: EVERYONE, Leadership: EVERYONE, PM: EVERYONE, Engineer: EVERYONE, Finance: EVERYONE, Sales: EVERYONE, HR: EVERYONE, Payroll: EVERYONE, Employee: EVERYONE },
  workflows: [agentRun],
  mcpTools: agentsTools,
  retention: agentsRetention,
};
