import { describe, expect, it } from "vitest";
import type { Viewer } from "@amax/auth";

const maya: Viewer = { tenantId: "t", userId: "u-maya", name: "Maya", email: "", assignments: [{ role: "Admin", legalEntityIds: null, departments: null }], actualRoles: ["Admin"], managedProjects: [], assignedProjects: [], reports: [] };
const id = "06060606-0000-4000-8000-000000000001";

describe("006 suggestion tools", { timeout: 30_000 }, () => {
  it("AC2 deciding is a person's act on chat's confirm card: accept, query, dismiss and undo refuse MCP and the API", async () => {
    const { toolRegistry } = await import("../lib/server");
    const registry = toolRegistry();
    for (const name of ["accept_agent_suggestion", "query_agent_suggestion", "dismiss_agent_suggestion", "undo_agent_suggestion"]) {
      for (const source of ["mcp", "api"] as const) await expect(registry.call(maya, name, { id, note: "why?" }, { source })).rejects.toThrow(/confirm it in amax chat/);
    }
    expect(registry.toolsFor(maya, ["read"]).map((t) => t.name)).toEqual(expect.arrayContaining(["list_agent_suggestions", "get_agent_suggestion", "get_agent_suggestion_run", "list_agent_jobs"]));
  });
});
