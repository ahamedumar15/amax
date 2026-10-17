import { defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS } from "./contracts";
import { presalesFixtures } from "./fixtures";
import { jobs } from "./jobs";
import { mcpTools, search } from "./mcp";
import { BoardPage } from "./ui/BoardPage";
import { OpportunityPage } from "./ui/OpportunityPage";

const READ = ["presales:read"];
const SELL = [...READ, "presales:opportunity:create", "presales:opportunity:edit", "presales:opportunity:remove"];

export default defineModule({
  id: "presales",
  title: "Presales",
  icon: "target",
  group: "Business",
  order: 20,
  dependsOn: ["delivery"],
  integratesWith: [],
  permissions: ["presales:read", "presales:opportunity:create", "presales:opportunity:edit", "presales:opportunity:remove", "presales:promote"],
  // Promoting needs delivery's own project permission too; delivery checks it when it creates the project.
  grants: { Leadership: READ, Sales: SELL, PM: [...READ, "presales:promote"] },
  routes: [
    { path: "", title: "Presales", component: BoardPage },
    { path: "o/:number", title: "Opportunity", component: OpportunityPage },
  ],
  mcpTools,
  search: search as never,
  retention: [
    // Sales records are kept seven years after the deal closes (or two idle years), then names are anonymised.
    { table: "presales.opportunity", fields: ["owner_name", "owner_user_id", "lead_name", "removed_by"], class: "personal", period: "P7Y", start: { at: ["closed_at", "removed_at"], idle: "P2Y" }, action: "anonymise" },
    { table: "presales.stage_change", fields: ["by_name", "by_actor"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
    { table: "presales.activity", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.task", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.risk", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.suggestion", fields: ["owner_name", "decided_by", "summary"], class: "personal", period: "P1Y", start: { at: ["decided_at", "found_at"] }, action: "anonymise" },
  ],
  chatIntents,
  jobs,
  events: { emits: Object.values(EVENTS) },
  fixtures: [presalesFixtures],
});
