import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { costLabel } from "@amax/ai/usage-format";
import { aiTools, getAiUsageTool } from "@amax/ai/usage-tool";
import { canEver, canSeePricing, itAdminGrants, ROLES, setGrants, type Role, type Viewer } from "@amax/auth";
import { chatPlatform } from "@amax/chat";
import { privacyGrants } from "@amax/core/privacy";
import { createRegistry } from "@amax/mcp";
import { adminModule, type AdminDeps } from "../../lib/admin";
import { installed } from "../../lib/registry";
import { adminDb, T } from "./fixture";

const as = (role: Role): Viewer => ({ tenantId: "t", userId: `u-${role}`, name: role, email: "", assignments: [{ role, legalEntityIds: null, departments: null }], actualRoles: [role], managedProjects: [], assignedProjects: [], reports: [] });
const unused = () => { throw new Error("not called"); };
const deps = { db: unused, workflows: unused, engine: unused, tools: unused } as unknown as AdminDeps;

/**
 * Every platform tool no role but Admin can reach today. A new one fails this test until IT Admin is
 * granted it. Module tools are out of scope (055): their records carry contract and deal values that
 * the pricing class doesn't cover yet, so module access stays with the module's own grants.
 */
const ADMIN_ONLY = [
  "audit_status", "search_audit", "get_trace",
  "settings_overview",
  "list_secrets", "get_secret_meta", "put_secret", "rotate_secret", "revoke_secret",
  "list_mcp_clients", "get_mcp_client", "list_mcp_tools", "get_mcp_tool", "revoke_mcp_client",
  "get_ai_policy", "set_ai_policy",
  "list_schedules", "get_schedule", "list_workflow_runs", "get_workflow_run", "control_workflow_run", "set_schedule_enabled", "set_entity_zone",
  "list_api_credentials", "get_api_credential", "create_api_credential", "rotate_api_credential", "revoke_api_credential",
  "get_api_overview", "list_webhooks", "get_webhook", "subscribe_webhook", "unsubscribe_webhook", "resume_webhook",
];

/** 034 AC-6: Admin only by design. A whole-tenant export carries pay and money (the pricing class IT Admin never sees). */
const ADMIN_ALONE = [
  "backups_overview", "list_restore_drills", "get_restore_drill", "list_tenant_exports", "get_tenant_export", "get_tenant_export_link",
  "request_restore_drill", "request_tenant_export", "approve_tenant_export", "cancel_tenant_export", "start_tenant_offboarding", "cancel_tenant_offboarding",
];

describe("055 IT Admin grants", () => {
  beforeAll(() => setGrants([...installed, chatPlatform, privacyGrants, itAdminGrants]));

  it("AC-2 IT Admin holds every Admin-only tool by explicit grant, and not the pricing class", () => {
    const registry = createRegistry([aiTools, ...installed, chatPlatform, adminModule(deps)]);
    const others = ROLES.filter((r) => r !== "Admin" && r !== "ITAdmin");
    const modules = new Set(installed.map((m) => m.id));
    const adminOnly = registry.all.filter((t) => t.permission && !modules.has(t.module) && !others.some((r) => canEver(as(r), t.permission)));
    const table = Object.fromEntries(adminOnly.map((t) => [t.name, canEver(as("ITAdmin"), t.permission)]));
    expect(table).toEqual(Object.fromEntries([...ADMIN_ONLY.map((n) => [n, true]), ...ADMIN_ALONE.map((n) => [n, false])]));
    expect(registry.toolsFor(as("ITAdmin")).map((t) => t.name)).toEqual(expect.arrayContaining(ADMIN_ONLY));
    expect([canSeePricing(as("Admin")), canSeePricing(as("ITAdmin")), canSeePricing(as("ITAdmin"), "u-ITAdmin")]).toEqual([true, false, true]);
  });
});

describe.skipIf(!hasDb)("055 IT Admin pricing (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    setGrants([itAdminGrants]);
    const [maya] = await db.t.owner`select id from auth.user where email = 'maya@lumenlabs.test'`;
    await db.t.owner`insert into ai.call (tenant_id, user_id, caller, source, purpose, model, ok, input_tokens, output_tokens, cost_usd)
      values (${T}, ${maya.id}, 'user:maya', 'chat', 'chat', 'm', true, 100, 10, 2.5), (${T}, ${maya.id}, 'user:maya', 'chat', 'chat', 'm', true, 50, 5, null)`;
    await db.engine.start(T, "core.audit-check", null, { startedBy: "test" });
  });
  afterAll(() => db?.t.drop());

  it("AC-3 the MCP tools give IT Admin calls and tokens with no cost fields, never null-as-$0; an Admin still sees cost", async () => {
    const [ravi, maya] = [await db.as("ravi"), await db.as("maya")];
    const usage = await getAiUsageTool.run(ravi, { scope: "tenant" });
    expect(usage.totals).toEqual({ calls: 2, inputTokens: 150, outputTokens: 15, unknownCostCalls: 1, people: 1 });
    expect(costLabel(usage.totals)).toBe("Hidden for your role");
    for (const name of ["get_ai_policy", "list_workflow_runs"]) {
      const out = JSON.stringify(await db.registry.call(ravi, name, {}, { source: "mcp" }));
      expect([name, out.includes("costUsd")]).toEqual([name, false]);
      expect([name, JSON.stringify(await db.registry.call(maya, name, {}, { source: "mcp" })).includes("costUsd")]).toEqual([name, true]);
    }
    expect((await getAiUsageTool.run(maya, { scope: "tenant" })).totals).toMatchObject({ costUsd: 2.5 });
    expect((await getAiUsageTool.run(ravi, { scope: "self" })).totals).toMatchObject({ calls: 0, costUsd: null });
  });
});
