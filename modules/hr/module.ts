import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, personIdsForUser, reportUserIds, type PersonChanged, type PersonJoined, type PersonLeft } from "./contracts";
import { hrFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { statusDatesJob } from "./server/jobs";
import { PeopleAllPage, PeoplePage } from "./ui/PeoplePage";
import { PersonPage } from "./ui/PersonPage";

const READ = ["hr:read"];

export default defineModule({
  id: "hr",
  title: "People",
  icon: "user",
  group: "People",
  order: 10,
  primary: true,
  dependsOn: [],
  integratesWith: [],
  permissions: ["hr:read", "hr:person:create", "hr:person:update", "hr:person:leave"],
  grants: {
    Leadership: READ,
    PM: READ,
    Payroll: READ,
    HR: [...READ, "hr:person:create", "hr:person:update", "hr:person:leave"],
  },
  routes: [
    { path: "", title: "People", component: PeoplePage },
    { path: "all", title: "People", component: PeopleAllPage },
    { path: "e/:entity", title: "People", component: PeoplePage },
    { path: "e/:entity/all", title: "People", component: PeopleAllPage },
    { path: "p/:employeeNo", title: "Person", component: PersonPage },
  ],
  mcpTools,
  search: search as never,
  retention: [
    // People records are kept seven years after someone leaves, then anonymised. Pay and bank details
    // go seven years after the employment period ends; documents and probation notes likewise.
    { table: "hr.person", label: "Leavers' HR record", subject: ["id", "user_id"], entity: "legal_entity_id", fields: ["name", "initials", "work_email", "location"], class: "personal", period: "P7Y", start: { at: ["left_on"] }, action: "anonymise" },
    { table: "hr.employment", label: "Salary and EPF number", subject: ["person_id"], entity: "legal_entity_id", fields: ["base_salary", "epf_number"], class: "pay", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "hr.employment", label: "Bank details", subject: ["person_id"], entity: "legal_entity_id", fields: ["bank_name", "bank_account"], class: "bank", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "hr.document", label: "HR documents", subject: ["person_id"], fields: ["title", "file_ref"], class: "health", period: "P7Y", start: { at: ["dated_on"], idle: "P1Y" }, action: "delete" },
    { table: "hr.probation", label: "Probation notes", subject: ["person_id"], fields: ["outcome_note"], class: "performance", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
  ],
  viewerScopes: async (tx, user) => ({ reports: await reportUserIds(tx, user.userId) }),
  subjectIds: personIdsForUser,
  chatIntents,
  jobs: [statusDatesJob],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.personJoined]: declarePayload<PersonJoined>({ personId: "plain", userId: "plain", legalEntityId: "plain", department: "plain", joinedOn: "plain", status: "plain" }),
    [EVENTS.personLeft]: declarePayload<PersonLeft>({ personId: "plain", userId: "plain", leftOn: "plain" }),
    [EVENTS.personChanged]: declarePayload<PersonChanged>({ personId: "plain", userId: "plain", changed: "plain", effectiveOn: "plain" }),
  } },
  fixtures: [hrFixtures],
});
