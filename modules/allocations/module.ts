import { defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS } from "./contracts";
import { allocationsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { assignedProjectIds } from "./server/scopes";
import { AllocationsEveryonePage, AllocationsPage } from "./ui/AllocationsPage";
import { ProjectTeamPage } from "./ui/ProjectTeamPage";

const READ = ["allocations:read"];

export default defineModule({
  id: "allocations",
  title: "Allocations",
  icon: "people",
  group: "Work",
  order: 30,
  dependsOn: ["delivery", "hr"],
  integratesWith: ["leave"],
  permissions: ["allocations:read", "allocations:allocate", "allocations:copy"],
  grants: {
    Leadership: READ,
    HR: READ,
    PM: [...READ, "allocations:allocate@managed", "allocations:copy"],
  },
  routes: [
    { path: "", title: "Allocations", component: AllocationsPage },
    { path: "everyone", title: "Allocations", component: AllocationsEveryonePage },
    // The project page's Team section (051): served at /delivery/p/:key/team, gated by delivery:read here and allocations:read in the screen.
    { path: "p/:key/team", title: "Team", mount: "delivery", component: ProjectTeamPage },
  ],
  mcpTools,
  // Allocations hold no personal fields of their own: people are hr.person ids, names stay in hr.
  retention: [],
  viewerScopes: async (tx, user) => ({ assignedProjects: await assignedProjectIds(tx, user) }),
  chatIntents,
  jobs: [],
  events: { emits: Object.values(EVENTS) },
  fixtures: [allocationsFixtures],
});
