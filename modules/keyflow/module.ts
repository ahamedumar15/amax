import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type SyncCompleted, type SyncFailed } from "./contracts";
import { keyflowFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { KeyflowPage } from "./ui/KeyflowPage";
import { PerformancePage } from "./ui/PerformancePage";
import { syncSchedule, syncWorkflow } from "./workflows";

const PROFILE = ["keyflow:profile"];
const OWN = ["keyflow:profile@own"];

export default defineModule({
  id: "keyflow",
  title: "Keyflow",
  icon: "plug",
  group: "Operations",
  order: 80,
  dependsOn: ["hr"],
  integratesWith: [],
  permissions: ["keyflow:read", "keyflow:profile", "keyflow:manage", "keyflow:sync"],
  // The sync screen is for whoever runs integrations (Admin, IT Admin) and HR. A person's Keyflow page
  // is for whoever hr:read lets see them; everyone else sees only their own, over MCP and chat.
  // keyflow:sync is the job's own write: no role but Admin holds it.
  grants: {
    ITAdmin: ["keyflow:read", "keyflow:manage", ...OWN],
    HR: ["keyflow:read", ...PROFILE],
    Leadership: PROFILE,
    PM: PROFILE,
    Engineer: OWN,
    Finance: OWN,
    Sales: OWN,
    Payroll: OWN,
    Employee: OWN,
  },
  routes: [
    { path: "", title: "Keyflow", component: KeyflowPage },
    // The person page's Performance section (051): served at /hr/p/:employeeNo/performance, gated by hr:read there and keyflow:profile here.
    { path: "p/:employeeNo/performance", title: "Performance", mount: "hr", component: PerformancePage },
  ],
  mcpTools,
  search: search as never,
  retention: [
    { table: "keyflow.connection", label: "Who connected Keyflow", subject: ["set_by"], fields: ["set_by"], class: "personal", period: "P7Y", start: { at: ["set_at"] }, action: "anonymise" },
    { table: "keyflow.sync_run", label: "Keyflow sync runs", subject: ["started_by"], fields: ["started_by"], class: "personal", period: "P1Y", start: { at: ["finished_at"] }, action: "delete" },
    { table: "keyflow.sync_error", label: "Keyflow sync errors", subject: ["person_id", "dismissed_by"], subjectName: ["person_name"],
      fields: ["person_id", "person_name", "dismissed_by", "message"], class: "personal", period: "P1Y", start: { at: ["last_seen_at"] }, action: "delete" },
    { table: "keyflow.goal", label: "Goals from Keyflow", subject: ["person_id"], fields: ["title", "status", "progress"], class: "personal", period: "P2Y", start: { at: [], idle: "P1Y" }, action: "delete" },
    { table: "keyflow.review_score", label: "Review scores from Keyflow", subject: ["person_id"], fields: ["cycle", "score", "rating"], class: "performance", period: "P7Y", start: { at: ["reviewed_on"] }, action: "delete" },
    { table: "keyflow.recognition", label: "Recognition from Keyflow", subject: ["person_id"], subjectName: ["from_name"], fields: ["from_name", "message"], class: "personal", period: "P2Y", start: { at: ["given_on"] }, action: "delete" },
  ],
  chatIntents,
  jobs: [],
  workflows: [syncWorkflow],
  schedules: [syncSchedule],
  // 035: outgoing webhooks send only declared fields (review 058). Counts only, never a person's data.
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.completed]: declarePayload<SyncCompleted>({ runId: "plain", status: "plain", peopleOut: "plain", teamsOut: "plain", goalsIn: "plain", reviewsIn: "plain", recognitionIn: "plain", errors: "plain" }),
    [EVENTS.failed]: declarePayload<SyncFailed>({ runId: "plain", failure: "plain" }),
  } },
  fixtures: [keyflowFixtures],
});
