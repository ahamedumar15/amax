import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type AccessRequested, type ChecklistCompleted, type ChecklistStarted, type ExitAnswered, type ExitLinkIssued, type TaskCompleted } from "./contracts";
import { onboardingFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { joinedHandler, leftHandler } from "./server/checklists";
import { OnboardingPage } from "./ui/OnboardingPage";

const READ = ["onboarding:read"];
// A manager reads and ticks off only the checklist tasks that are theirs (013 AC-1).
const OWN = ["onboarding:read@own", "onboarding:task:complete@own"];

export default defineModule({
  id: "onboarding",
  title: "Onboarding",
  icon: "briefcase",
  group: "People",
  order: 30,
  dependsOn: ["hr"],
  integratesWith: ["it-access"],
  permissions: ["onboarding:read", "onboarding:task:complete", "onboarding:checklist:start", "onboarding:exit:send", "onboarding:exit:answer"],
  grants: {
    Leadership: READ,
    PM: OWN,
    Engineer: OWN,
    ITAdmin: [...READ, "onboarding:task:complete"],
    HR: [...READ, "onboarding:task:complete", "onboarding:checklist:start", "onboarding:exit:send"],
  },
  routes: [{ path: "", title: "Onboarding", component: OnboardingPage }],
  mcpTools,
  search: search as never,
  retention: [
    // Checklists are kept two years after the joining day or last day, then who it was and who did
    // what are anonymised. The name is kept beside the hr.person id so IT, who can't read hr, sees it.
    { table: "onboarding.checklist", label: "Joiner and leaver checklists", subject: ["person_id", "manager_user_id", "created_by"], subjectName: ["person_name", "manager_name"], entity: "legal_entity_id",
      fields: ["person_name", "manager_name", "created_by"], class: "personal", period: "P2Y", start: { at: ["starts_on"] }, action: "anonymise" },
    { table: "onboarding.task", label: "Checklist tasks", subject: ["owner_user_id", "completed_by"], fields: ["completed_by", "note"], class: "personal", period: "P2Y", start: { at: ["due_on"] }, action: "anonymise" },
    // 013 AC-3: a leaver's exit answers go to HR and are deleted two years after they answered (or the link was issued).
    { table: "onboarding.exit_link", label: "Exit questionnaire answers", subject: ["person_id", "issued_by"], fields: ["answers", "issued_by"], class: "personal", period: "P2Y", start: { at: ["answered_at", "issued_at"] }, action: "delete" },
  ],
  jobs: [],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: {
    emits: Object.values(EVENTS),
    handles: [joinedHandler, leftHandler],
    payloads: {
      [EVENTS.checklistStarted]: declarePayload<ChecklistStarted>({ checklistId: "plain", kind: "plain", personId: "plain", legalEntityId: "plain", startsOn: "plain", templateId: "plain", tasks: "plain", by: "plain" }),
      [EVENTS.taskCompleted]: declarePayload<TaskCompleted>({ checklistId: "plain", taskId: "plain", personId: "plain", owner: "plain", title: "plain", by: "plain" }),
      [EVENTS.checklistCompleted]: declarePayload<ChecklistCompleted>({ checklistId: "plain", kind: "plain", personId: "plain", completedOn: "plain", by: "plain" }),
      [EVENTS.accessRequested]: declarePayload<AccessRequested>({ personId: "plain", userId: "plain", kind: "plain", legalEntityId: "plain" }),
      [EVENTS.exitLinkIssued]: declarePayload<ExitLinkIssued>({ checklistId: "plain", personId: "plain", expiresAt: "plain", by: "plain" }),
      [EVENTS.exitAnswered]: declarePayload<ExitAnswered>({ checklistId: "plain", personId: "plain", answeredAt: "plain" }),
    },
  },
  fixtures: [onboardingFixtures],
});
