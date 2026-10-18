import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type LeaveApproved, type LeaveCancelled, type LeaveRejected, type LeaveRequested } from "./contracts";
import { leaveFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { releaseHandler } from "./server/releases";
import { LeavePage } from "./ui/LeavePage";

const OWN = ["leave:read", "leave:request@own", "leave:cancel@own"];
const MANAGE = [...OWN, "leave:approve"];
const LEAVE = { requestId: "plain", personId: "plain", userId: "plain", legalEntityId: "plain", type: "plain", startsOn: "plain", endsOn: "plain", halfDay: "plain", days: "plain" } as const;

export default defineModule({
  id: "leave",
  title: "Leave",
  icon: "calendar",
  group: "People",
  order: 20,
  dependsOn: ["hr"],
  integratesWith: ["delivery"],
  permissions: ["leave:read", "leave:request", "leave:cancel", "leave:approve", "leave:team", "leave:admin"],
  // Anyone may approve their own reports' leave (the check is the hr reporting line); HR decides and
  // cancels anyone's in its entities and sees medical details (002 health).
  grants: {
    Leadership: [...MANAGE, "leave:team"],
    PM: MANAGE,
    Engineer: MANAGE,
    Finance: MANAGE,
    Sales: MANAGE,
    Payroll: [...MANAGE, "leave:team"],
    Employee: OWN,
    HR: [...MANAGE, "leave:request", "leave:cancel", "leave:team", "leave:admin"],
  },
  routes: [
    { path: "", title: "Leave", component: LeavePage },
    { path: "m/:month", title: "Leave", component: LeavePage },
  ],
  mcpTools,
  retention: [
    { table: "leave.request", label: "Leave requests", subject: ["person_id", "user_id", "requested_by", "decided_by", "cancelled_by"], subjectName: ["person_name"], entity: "legal_entity_id",
      fields: ["person_name", "note", "decision_comment", "requested_by", "decided_by", "cancelled_by"], class: "personal", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "leave.request", label: "Medical reasons and certificates", subject: ["person_id", "user_id"], entity: "legal_entity_id",
      fields: ["medical_reason", "certificate_ref"], class: "health", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
  ],
  chatIntents,
  jobs: [],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: {
    emits: Object.values(EVENTS),
    handles: [releaseHandler],
    payloads: {
      [EVENTS.requested]: declarePayload<LeaveRequested>({ ...LEAVE, clashes: "plain" }),
      [EVENTS.approved]: declarePayload<LeaveApproved>({ ...LEAVE, paid: "plain", by: "plain" }),
      [EVENTS.rejected]: declarePayload<LeaveRejected>({ ...LEAVE, by: "plain" }),
      [EVENTS.cancelled]: declarePayload<LeaveCancelled>({ ...LEAVE, by: "plain", wasApproved: "plain" }),
    },
  },
  fixtures: [leaveFixtures],
});
