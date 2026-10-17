import { z } from "zod";
import { aiTools } from "./ai";
import { apiTools } from "./api";
import { mcpTools } from "./mcp";
import { secretTools } from "./secrets";
import { settingsStatus } from "./status";
import { read, tool, type AdminDeps } from "./tool";
import { workflowTools } from "./workflows";

export type { AdminDeps } from "./tool";
export { settingsStatus, type Area } from "./status";

/** The admin screens' MCP tools (047 AC-2, AC-5): Admin only, the same ones the chat confirms. */
export const adminModule = (d: AdminDeps) => ({
  id: "settings",
  mcpTools: [
    tool({ ...read("settings:read"), name: "settings_overview", description: "Every admin settings area with its status and what needs attention first.", input: z.object({ area: z.string().optional() }),
      run: async (v, a) => (await settingsStatus(d, v)).filter((x) => !a.area || x.id === a.area) }),
    ...secretTools,
    ...mcpTools(d),
    ...aiTools(d),
    ...workflowTools(d),
    ...apiTools(d),
  ],
});
