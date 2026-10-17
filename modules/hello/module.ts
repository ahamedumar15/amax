import { defineModule } from "@amax/core";
import { HelloPage } from "./ui/HelloPage";

export default defineModule({
  id: "hello",
  title: "Hello",
  icon: "spark",
  group: "Work",
  order: 99,
  dependsOn: [],
  integratesWith: [],
  permissions: ["hello:read"],
  routes: [{ path: "", title: "Hello", component: HelloPage }],
  mcpTools: [],
  chatIntents: [],
  jobs: [],
  fixtures: [],
});
