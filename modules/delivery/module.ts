import { defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { deliveryFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { managedProjectIds } from "./contracts";
import { ProjectsPage } from "./ui/ProjectsPage";
import { ProjectPage } from "./ui/ProjectPage";
import { ProposalsPage } from "./ui/ProposalsPage";
import { ReleasesPage } from "./ui/ReleasesPage";
import { ReleasePage } from "./ui/ReleasePage";

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
    { path: "proposals", title: "Proposals", component: ProposalsPage },
    { path: "proposals/:phase", title: "Proposals", component: ProposalsPage },
    { path: "releases", title: "Releases", component: ReleasesPage },
    { path: "releases/:projectKey/:version", title: "Release", component: ReleasePage },
  ],
  mcpTools,
  search: search as never,
  retention: [
    // Delivery evidence is kept seven years, then names are anonymised. A proposal's clock starts
    // when it's released (released_at, cleared again if the release is voided) or after a year with
    // no change, which covers withdrawn and abandoned ones. A project's starts when it's closed: an
    // open project is in use, so its manager stays named.
    { table: "delivery.project", fields: ["manager_name", "manager_user_id"], class: "personal", period: "P7Y", start: { at: ["closed_at"] }, action: "anonymise" },
    { table: "delivery.proposal", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["released_at"], idle: "P1Y" }, action: "anonymise" },
    { table: "delivery.deployment", fields: ["recorded_by"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
    // The voider's clock starts at the void, which can be years after the deployment (final review).
    { table: "delivery.deployment", fields: ["voided_by"], class: "personal", period: "P7Y", start: { at: ["voided_at"] }, action: "anonymise" },
  ],
  viewerScopes: async (tx, user) => ({ managedProjects: await managedProjectIds(tx, user.userId) }),
  chatIntents,
  jobs: [],
  events: { emits: ["delivery.release.deployed", "delivery.proposal.phase_changed", "delivery.proposal.rekeyed"] },
  fixtures: [deliveryFixtures],
});
