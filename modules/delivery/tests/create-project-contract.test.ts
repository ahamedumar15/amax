import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, retryable, withIdempotency } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { createProject, getProjectRef, PROJECT_CREATE_PERMISSION, ProjectConflictError } from "../contracts";
import { createRegistry } from "@amax/mcp";
import { createProjectService } from "../server/project-create";
import { ctxFor } from "../server/context";
import { listEnvironments } from "../server/queries";

const T = lumen.tenant.id;

// 045: the project creation presales' "Promote to delivery" calls through the contract.
describe.skipIf(!hasDb)("045 createProject contract (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let admin: Viewer, engineer: Viewer;
  const ref = (key: string) => withTenant(app, T, (tx) => getProjectRef(tx, key));
  const bySource = (s: string) => withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.project where source_ref = ${s}`));

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    admin = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    engineer = applyViewAs(admin, "Engineer");
  });
  afterAll(() => t?.drop());

  it("AC-1 presales' call shape creates the project with its environments, once under an idempotency key", async () => {
    const input = { key: "PRA", name: "Promoted", client: "Northwind", billing: "t&m" as const };
    const first = await withIdempotency("045:pra", () => createProject(ctxFor(admin), input));
    const again = await withIdempotency("045:pra", () => createProject(ctxFor(admin), input));
    expect(first).toMatchObject({ ok: true, writes: 1, value: { key: "PRA" } });
    const id = first.ok ? first.value.id : "";
    expect(again).toMatchObject({ ok: true, value: { id, key: "PRA", replayed: true } });
    expect((await ref("PRA"))?.id).toBe(id);
    expect((await listEnvironments(admin, "PRA")).map((e) => e.name)).toEqual(["Dev", "QA", "UAT", "Prod"]);
  });

  const make = (key: string, sourceRef?: string) => createProject(ctxFor(admin), { key, name: key, client: "x", billing: "fixed", sourceRef });
  const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps).then((rs) => rs.map((r) => r.status === "fulfilled" ? "made" : (r.reason as Error).name));

  it("AC-2 a sourceRef makes one project, also when creates retry or race", async () => {
    const made = await make("SRA", "presales.opportunity:OPP0042");
    await expect(make("SRA", "presales.opportunity:OPP0042")).resolves.toEqual({ id: made.id, key: "SRA", existing: true });
    const race = await Promise.all([make("SRC", "presales.opportunity:OPP0043"), make("SRC", "presales.opportunity:OPP0043")]);
    expect(race[0].id).toBe(race[1].id);
    expect(race.filter((r) => r.existing)).toHaveLength(1);
    expect(await bySource("presales.opportunity:OPP0043")).toHaveLength(1);
  });

  const registry = createRegistry([delivery]);
  const mcpCreate = (source: "mcp" | "chat") => () => registry.call(admin, "create_project", { key: "CON", name: "C", client: "x", billing: "fixed" }, { source });
  it.each([
    ["contract: a taken key", () => make("CON"), "CON"],
    ["contract: a taken key with a new sourceRef", () => make("CON", "presales.opportunity:OPP0050"), "CON"],
    ["contract: a sourceRef that made another key", () => make("SRZ", "presales.opportunity:OPP0042"), "SRA"],
    ["service (UI): a taken key", () => createProjectService(ctxFor(admin), { key: "CON", name: "C", client: "x", billing: "fixed" }), "CON"],
    ["MCP create_project: a taken key", mcpCreate("mcp"), "CON"],
    ["chat create_project: a taken key", mcpCreate("chat"), "CON"],
  ])("AC-3 %s is a ProjectConflictError that names the clash", async (_name, run, existingKey) => {
    const e = await (run as () => Promise<unknown>)().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ProjectConflictError);
    expect(e).toMatchObject({ existingKey, message: expect.stringMatching(/is taken; choose another|already made project/) });
    expect(retryable(e)).toBe(false);
  });

  it.each([["it-access.request:REQ-7", "VAA", true], ["payroll-lk.run:2026_10", "VAB", true], ["OPP0001", "VAC", false], ["Presales.opportunity:1", "VAD", false], ["presales.opportunity:", "VAE", false]] as const)(
    "AC-3 sourceRef %s (project %s) is accepted: %s", async (sourceRef, key, ok) => {
      const run = make(key, sourceRef);
      await (ok ? expect(run).resolves.toMatchObject({ key }) : expect(run).rejects.toThrow(/module.record:id/));
    });

  it("AC-3 racing creates for one key: one project, the other a conflict; sourceRef is the contract's, in module.record:id form", async () => {
    expect((await settle([make("RKY", "presales.opportunity:OPP0060"), make("RKY", "presales.opportunity:OPP0061")])).sort()).toEqual(["ProjectConflictError", "made"]);
    expect(await ref("SRZ")).toBeNull();
    await createProjectService(ctxFor(admin), { key: "MCP", name: "M", client: "x", billing: "fixed", sourceRef: "presales.opportunity:OPP0070" });
    expect(await bySource("presales.opportunity:OPP0070")).toHaveLength(0);
  });

  it("AC-4 the published permission gates both entry points; bad input is refused", async () => {
    expect(delivery.permissions).toContain(PROJECT_CREATE_PERMISSION);
    const input = { key: "NOP", name: "No", client: "x", billing: "fixed" as const };
    await expect(createProject(ctxFor(engineer), input)).rejects.toThrow(/forbidden: delivery:project:create/);
    await expect(createProject(ctxFor(admin), { ...input, key: "no" })).rejects.toThrow(/invalid input/);
  });
});
