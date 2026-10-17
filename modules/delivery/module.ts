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
    { table: "delivery.project", fields: ["manager_name", "manager_user_id"], keep: "while the project is active, then 7 years with its contract" },
    { table: "delivery.proposal", fields: ["owner_name"], keep: "7 years after release (delivery evidence)" },
    { table: "delivery.deployment", fields: ["recorded_by", "voided_by"], keep: "7 years (release audit trail)" },
  ],
  viewerScopes: async (tx, user) => ({ managedProjects: await managedProjectIds(tx, user.userId) }),
  chatIntents,
  jobs: [],
  events: { emits: ["delivery.release.deployed", "delivery.proposal.phase_changed"] },
  fixtures: [deliveryFixtures],
});
