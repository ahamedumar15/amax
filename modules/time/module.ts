import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type EntryLogged, type WeekDecided, type WeekReminded, type WeekReopened, type WeekSubmitted } from "./contracts";
import { timeFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { MyPage } from "./ui/MyPage";
import { TeamPage } from "./ui/TeamPage";

const OWN = ["time:read", "time:log@own", "time:submit@own"];
const APPROVE = [...OWN, "time:approve@managed"];

export default defineModule({
  id: "time",
  title: "Time",
  icon: "clock",
  group: "Work",
  order: 20,
  dependsOn: ["delivery"],
  integratesWith: ["hr", "leave"],
  permissions: ["time:read", "time:log", "time:submit", "time:approve", "time:team", "time:admin"],
  grants: {
    Leadership: [...APPROVE, "time:team"],
    Finance: [...OWN, "time:team"],
    PM: APPROVE,
    Engineer: APPROVE,
    Sales: OWN,
    HR: OWN,
    Payroll: OWN,
    Employee: OWN,
  },
  routes: [
    { path: "", title: "Time", component: TeamPage },
    { path: "w/:week", title: "Time", component: TeamPage },
    { path: "my", title: "My timesheet", component: MyPage },
    { path: "my/:week", title: "My timesheet", component: MyPage },
  ],
  mcpTools,
  retention: [
    { table: "time.week", label: "Timesheet weeks", subject: ["user_id", "decided_by"], subjectName: ["person_name"], fields: ["person_name", "note", "reject_comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["decided_at"], idle: "P1Y" }, action: "anonymise" },
    { table: "time.entry", label: "Time entries", subject: ["user_id", "project_id", "logged_by"], fields: ["note", "logged_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "time.approval", label: "Timesheet approvals", subject: ["decided_by"], fields: ["comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
  ],
  chatIntents,
  jobs: [],
  // 030: who hears about a week. Approvers see a submission; the person hears the decision and reminders.
  notifications: [
    { id: "time.week-submitted", event: EVENTS.weekSubmitted, category: "approvals", to: [{ approvers: "userId" }], permission: "time:approve", subject: "userId",
      title: "{userId|name} submitted {week}", body: "{hours} h to approve", href: "/time/w/{week}" },
    { id: "time.week-approved", event: EVENTS.weekApproved, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Your timesheet for {week} was approved", href: "/time/my/{week}" },
    { id: "time.week-rejected", event: EVENTS.weekRejected, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Your timesheet for {week} was sent back", body: "{comment}", href: "/time/my/{week}" },
    { id: "time.week-reminded", event: EVENTS.weekReminded, category: "reminders", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Reminder: submit your timesheet for {week}", href: "/time/my/{week}" },
  ],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.entryLogged]: declarePayload<EntryLogged>({ entryId: "plain", weekId: "plain", userId: "plain", projectId: "plain", day: "plain", hours: "plain", billable: "plain", source: "plain", lockedChange: "plain" }),
    [EVENTS.weekSubmitted]: declarePayload<WeekSubmitted>({ weekId: "plain", userId: "plain", week: "plain", hours: "plain" }),
    [EVENTS.weekApproved]: declarePayload<WeekDecided>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", chain: "plain", comment: "plain" }),
    [EVENTS.weekRejected]: declarePayload<WeekDecided>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", chain: "plain", comment: "plain" }),
    [EVENTS.weekReopened]: declarePayload<WeekReopened>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", reason: "plain" }),
    [EVENTS.weekReminded]: declarePayload<WeekReminded>({ weekId: "plain", userId: "plain", week: "plain", by: "plain" }),
  } },
  fixtures: [timeFixtures],
});
