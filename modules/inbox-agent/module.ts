import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type FindTriaged, type ScanCompleted } from "./contracts";
import { inboxFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { closeOnDismiss, routeKind, suggestAgent } from "./suggestions";
import { InboxPage } from "./ui/InboxPage";
import { scanSchedule, scanWorkflow } from "./workflows";

const READ = ["inbox-agent:read"];
// A find is decided by the person the agent acted for (their mailbox, or the channel they own); Admin decides any.
const OWN = ["inbox-agent:decide@own"];

export default defineModule({
  id: "inbox-agent",
  title: "Inbox agent",
  icon: "spark",
  group: "Operations",
  order: 85,
  dependsOn: [],
  // Each owns a record type the agent can suggest; without it, that type is never suggested.
  integratesWith: ["presales", "leave", "helpdesk"],
  // inbox-agent:scan is the job's own write: no role but Admin holds it.
  permissions: ["inbox-agent:read", "inbox-agent:decide", "inbox-agent:manage", "inbox-agent:scan"],
  grants: {
    ITAdmin: [...READ, "inbox-agent:manage", ...OWN],
    Leadership: [...READ, ...OWN],
    Sales: [...READ, ...OWN],
    HR: [...READ, ...OWN],
    PM: OWN, Engineer: OWN, Finance: OWN, Payroll: OWN, Employee: OWN,
  },
  routes: [{ path: "", title: "Inbox agent", component: InboxPage }],
  mcpTools,
  // 032 (025 AC-5): a message is kept only as an excerpt and a link, deleted 30 days after its find
  // closes (added, dismissed, or nothing to suggest) or its suggestion expires.
  retention: [
    { table: "inbox_agent.find", label: "Inbox agent excerpts", subject: ["acts_for"], fields: ["excerpt", "link", "fields", "acts_for"], class: "personal", period: "P30D", start: { at: ["closed_at", "expires_at"] }, action: "delete" },
    { table: "inbox_agent.source", label: "Inbox agent allow-list", subject: ["acts_for", "allowed_by", "removed_by"], fields: ["address", "acts_for", "allowed_by", "removed_by"], class: "personal", period: "P1Y", start: { at: ["removed_at"] }, action: "delete" },
    { table: "inbox_agent.consent", label: "Who recorded Entra consent", subject: ["recorded_by"], fields: ["recorded_by"], class: "personal", period: "P7Y", start: { at: ["recorded_at"] }, action: "anonymise" },
    { table: "inbox_agent.scan", label: "Teams and email scans", subject: ["started_by"], fields: ["started_by", "failure"], class: "personal", period: "P1Y", start: { at: ["finished_at"] }, action: "delete" },
  ],
  chatIntents,
  workflows: [scanWorkflow],
  schedules: [scanSchedule],
  // 035: outgoing webhooks send only declared fields. Ids and counts, never a message.
  events: {
    emits: Object.values(EVENTS),
    handles: [suggestAgent, closeOnDismiss],
    payloads: {
      [EVENTS.scanned]: declarePayload<ScanCompleted>({ scanId: "plain", status: "plain", messages: "plain" }),
      [EVENTS.triaged]: declarePayload<FindTriaged>({ findId: "plain", recordType: "plain" }),
    },
  },
  suggestions: [routeKind],
  fixtures: [inboxFixtures],
});
