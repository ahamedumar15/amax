import { defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS } from "./contracts";
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
    { table: "time.week", label: "Timesheet weeks", subject: ["user_id"], fields: ["person_name", "note", "reject_comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["decided_at"], idle: "P1Y" }, action: "anonymise" },
    { table: "time.entry", label: "Time entries", subject: ["user_id", "project_id"], fields: ["note", "logged_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "time.approval", label: "Timesheet approvals", subject: ["decided_by"], fields: ["comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
  ],
  chatIntents,
  jobs: [],
  events: { emits: Object.values(EVENTS) },
  fixtures: [timeFixtures],
});
