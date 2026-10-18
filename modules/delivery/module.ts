import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { deliveryFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { listActivity } from "./server/activity";
import { EVENTS, managedProjectIds, type ProposalPhaseChanged, type ProposalRekeyed, type ReleaseDeployed } from "./contracts";
import { ProjectsPage } from "./ui/ProjectsPage";
import { ProjectPage } from "./ui/ProjectPage";
import { ProposalsPage } from "./ui/ProposalsPage";
import { ReleasesPage } from "./ui/ReleasesPage";
import { ReleasePage } from "./ui/ReleasePage";
import { ProjectProposals, ProjectReleases } from "./ui/ProjectLists";
import { ContractSection, RisksSection, TeamSection } from "./ui/ProjectSections";

const READ = ["delivery:read"];

export default defineModule({
  id: "delivery",
  title: "Projects",
  icon: "grid",
  group: "Work",
  order: 10,
  primary: true,
  nav: [{ path: "proposals", title: "Proposals", icon: "doc" }, { path: "releases", title: "Releases", icon: "rocket" }],
  dependsOn: [],
  integratesWith: [],
  permissions: ["delivery:read", "delivery:project:create", "delivery:proposal:create", "delivery:proposal:move", "delivery:release:create", "delivery:deployment:record"],
  grants: {
    Leadership: READ,
    Finance: READ,
    Engineer: [...READ, "delivery:proposal:create@assigned", "delivery:proposal:move@assigned"],
    PM: [...READ, "delivery:project:create", "delivery:proposal:create", "delivery:proposal:move@managed", "delivery:release:create@managed", "delivery:deployment:record@managed"],
  },
  routes: [
    { path: "", title: "Projects", component: ProjectsPage },
    { path: "p/:key", title: "Project", component: ProjectPage },
    { path: "p/:key/proposals", title: "Proposals", component: ProjectProposals },
    { path: "p/:key/proposals/:phase", title: "Proposals", component: ProjectProposals },
    { path: "p/:key/releases", title: "Releases", component: ProjectReleases },
    { path: "p/:key/risks", title: "Risks and decisions", component: RisksSection },
    // Allocations mounts the real Team section over this one (051); this shows when it's switched off.
    { path: "p/:key/team", title: "Team", component: TeamSection },
    { path: "p/:key/contract", title: "Contract", component: ContractSection },
    { path: "proposals", title: "Proposals", component: ProposalsPage },
    { path: "proposals/:phase", title: "Proposals", component: ProposalsPage },
    { path: "releases", title: "Releases", component: ReleasesPage },
    { path: "releases/:projectKey/:version", title: "Release", component: ReleasePage },
  ],
  mcpTools,
  search: search as never,
  activity: listActivity as never,
  retention: [
    // Delivery evidence is kept seven years, then names are anonymised. A proposal's clock starts
    // when it's released (released_at, cleared again if the release is voided) or after a year with
    // no change, which covers withdrawn and abandoned ones. A project's starts when it's closed: an
    // open project is in use, so its manager stays named.
    { table: "delivery.project", label: "Project managers", subject: ["id", "manager_user_id"], subjectName: ["manager_name"], entity: "legal_entity_id", fields: ["manager_name", "manager_user_id"], class: "personal", period: "P7Y", start: { at: ["closed_at"] }, action: "anonymise" },
    { table: "delivery.proposal", label: "Proposal owners", subject: ["project_id"], subjectName: ["owner_name"], fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["released_at"], idle: "P1Y" }, action: "anonymise" },
    { table: "delivery.deployment", label: "Who recorded a deployment", subject: ["recorded_by"], fields: ["recorded_by"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
    // The voider's clock starts at the void, which can be years after the deployment (final review).
    { table: "delivery.deployment", label: "Who voided a deployment", subject: ["voided_by"], fields: ["voided_by"], class: "personal", period: "P7Y", start: { at: ["voided_at"] }, action: "anonymise" },
  ],
  viewerScopes: async (tx, user) => ({ managedProjects: await managedProjectIds(tx, user.userId) }),
  chatIntents,
  jobs: [],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: {
    emits: Object.values(EVENTS),
    payloads: {
      [EVENTS.releaseDeployed]: declarePayload<ReleaseDeployed>({ releaseId: "plain", projectId: "plain", version: "plain", environment: "plain", status: "plain", released: "plain" }),
      [EVENTS.proposalPhaseChanged]: declarePayload<ProposalPhaseChanged>({ proposalId: "plain", key: "plain", projectId: "plain", from: "plain", to: "plain", by: "plain" }),
      [EVENTS.proposalRekeyed]: declarePayload<ProposalRekeyed>({ proposalId: "plain", projectId: "plain", from: "plain", to: "plain" }),
    },
  },
  // 030: a rollback is urgent for the PMs who manage that project (their data scope).
  notifications: [
    { id: "delivery.release-rolled-back", event: EVENTS.releaseDeployed, when: { status: "rolled-back" }, category: "releases", urgency: "urgent",
      to: [{ role: "PM" }], permission: "delivery:deployment:record", scope: { projectId: "projectId" },
      title: "Release {version} rolled back in {environment}", href: "/delivery/releases" },
  ],
  fixtures: [deliveryFixtures],
});
