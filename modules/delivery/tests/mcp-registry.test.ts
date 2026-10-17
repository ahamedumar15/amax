import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { managedProjectIds } from "../contracts";
import { ctxFor } from "../server/context";
import { moveProposal } from "../server/services";
import { createRegistry, ToolError } from "@amax/mcp";

const T = lumen.tenant.id;

describe("AC-2 registry shape", () => {
  it("rejects duplicate tool names", () => {
    const t = delivery.mcpTools![0];
    expect(() => createRegistry([{ id: "a", mcpTools: [t] }, { id: "b", mcpTools: [t] }])).toThrow(/declared twice/);
  });
});

describe.skipIf(!hasDb)("AC-2/AC-3 registry with delivery (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, liam: Viewer;
  const registry = createRegistry([delivery]);
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return { ...v, managedProjects: await withTenant(app, T, (tx) => managedProjectIds(tx, v.userId)) };
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    liam = await as("liam@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-3 lists only tools the roles allow; whoami and search are always there", () => {
    expect(registry.toolsFor(liam).map((x) => x.name)).toEqual(["whoami", "search"]);
    expect(registry.toolsFor(maya).map((x) => x.name)).toEqual(expect.arrayContaining(["list_projects", "create_proposal", "move_proposal", "record_deployment"]));
  });

  it("AC-3 a token without the write scope can't list or call write tools", async () => {
    const readOnly = registry.toolsFor(maya, ["read"]).map((x) => x.name);
    expect(readOnly).toContain("list_projects");
    expect(readOnly).not.toContain("move_proposal");
    await expect(registry.call(maya, "move_proposal", { key: "CON-016", to: "planned" }, { scopes: ["read"], source: "mcp" })).rejects.toBeInstanceOf(ToolError);
    await expect(registry.call(liam, "list_projects", {}, { source: "mcp" })).rejects.toThrow(/forbidden/);
    await expect(registry.call(maya, "move_proposal", { key: 1 }, { source: "mcp" })).rejects.toThrow(/invalid input/);
  });

  it("whoami and search", async () => {
    expect(await registry.call(maya, "whoami", {}, { source: "mcp" })).toMatchObject({ name: "Maya Fernando", roles: ["PM"], viewAs: "PM" });
    const hits = (await registry.call(maya, "search", { query: "contoso" }, { source: "mcp" })) as { id: string }[];
    expect(hits.map((h) => h.id)).toContain("CON");
  });

  it("AC-2 the same service through a page action and through MCP: same result and audit, apart from source", async () => {
    await moveProposal(ctxFor(maya, "ui"), { key: "CON-016", to: "planned" });
    await registry.call(maya, "move_proposal", { key: "CON-017", to: "planned" }, { source: "mcp" });
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select action, actor, source, before, after from core.audit_event where action = 'delivery.proposal.move' order by seq`));
    expect(rows.map((r) => r.source)).toEqual(["ui", "mcp"]);
    const strip = (r: Record<string, unknown>) => ({ ...r, source: undefined });
    expect(strip(rows[0])).toEqual(strip(rows[1]));
  });
});
