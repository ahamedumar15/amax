import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type AccessApproved, type TicketCreated, type TicketResolved } from "./contracts";
import { helpdeskFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { joinerLaptop } from "./server/handlers";
import { APPROVE, CREATE, MANAGE, queuePerm, READ, TRIAGE } from "./server/read";
import { supportKinds } from "./suggestions";
import { HelpdeskPage } from "./ui/HelpdeskPage";
import { triageSchedule, triageWorkflow } from "./workflows";

// Everyone raises tickets and approves access to what they own; IT Admin works the IT and Facilities
// queues, HR the HR queue (HR tickets are seen by HR and Admin only). helpdesk:triage is the support agent's own write.
const EVERYONE = [CREATE, `${APPROVE}@own`];

export default defineModule({
  id: "helpdesk",
  title: "Helpdesk",
  icon: "help",
  group: "Operations",
  order: 75,
  dependsOn: [],
  integratesWith: ["onboarding", "hr"],
  permissions: [READ, CREATE, MANAGE, APPROVE, TRIAGE, queuePerm("it"), queuePerm("hr"), queuePerm("facilities")],
  grants: {
    ITAdmin: [...EVERYONE, READ, MANAGE, queuePerm("it"), queuePerm("facilities")],
    HR: [...EVERYONE, READ, queuePerm("hr")],
    Leadership: EVERYONE, PM: EVERYONE, Engineer: EVERYONE, Finance: EVERYONE, Sales: EVERYONE, Payroll: EVERYONE, Employee: EVERYONE,
  },
  routes: [{ path: "", title: "Helpdesk", component: HelpdeskPage }],
  mcpTools,
  // 032: tickets and their events are kept seven years after the ticket closes; a rating goes with its ticket.
  retention: [
    { table: "helpdesk.ticket", label: "Helpdesk tickets", subject: ["requester_user_id", "handled_by", "created_by"], fields: ["title", "body", "note", "resolution", "source_link", "handled_by", "created_by"],
      class: "personal", period: "P7Y", start: { at: ["closed_at"] }, action: "delete" },
    { table: "helpdesk.ticket_event", label: "Helpdesk ticket history", subject: ["done_by"], fields: ["done_by", "detail"], class: "personal", period: "P7Y", start: { at: ["ticket_closed_at"] }, action: "delete" },
  ],
  chatIntents,
  workflows: [triageWorkflow],
  schedules: [triageSchedule],
  // 035: outgoing webhooks send only declared fields: ids, the queue and channel, never ticket text.
  events: {
    emits: Object.values(EVENTS),
    handles: [joinerLaptop],
    payloads: {
      [EVENTS.created]: declarePayload<TicketCreated>({ ticketId: "plain", queue: "plain", channel: "plain" }),
      [EVENTS.resolved]: declarePayload<TicketResolved>({ ticketId: "plain", queue: "plain", byAgent: "plain" }),
      [EVENTS.accessApproved]: declarePayload<AccessApproved>({ ticketId: "plain", resourceId: "plain", approvedBy: "plain" }),
    },
  },
  suggestions: supportKinds,
  fixtures: [helpdeskFixtures],
});
