import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase, tablesMissingRls } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import manifest from "../module";
import { EVENTS, getProjectRef, listProjectRefs, managedProjectIds, PHASES } from "../contracts";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { getProject, listProjects, listProposals, listReleases, phaseCounts } from "../server/queries";
import { moveProposal, recordDeployment } from "../server/services";
import { nextStep } from "../ui/ReleasesPage";

const T = lumen.tenant.id;

describe("AC-5 contract shape", () => {
  it("exports phases and event names", () => {
    expect(PHASES).toEqual(["proposed", "planned", "building", "verified", "released"]);
    expect(EVENTS).toEqual({ releaseDeployed: "delivery.release.deployed", proposalPhaseChanged: "delivery.proposal.phase_changed" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
  });
  it("AC-4 declares the five MCP tools and three chat intents", () => {
    expect(mcpTools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_projects", "get_project", "list_proposals", "get_release", "record_deployment"]));
    expect((manifest.chatIntents as { id: string }[]).map((c) => c.id)).toEqual(expect.arrayContaining(["delivery.new-project", "delivery.new-proposal", "delivery.new-release"]));
  });
});

describe.skipIf(!hasDb)("delivery against Postgres", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, nimal: Viewer, liam: Viewer, sahan: Viewer;
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return v;
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    setViewerScopeResolvers([manifest.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, manifest], lumen);
    [maya, nimal, liam, sahan] = await Promise.all(["maya", "nimal", "liam", "sahan"].map((k) => as(`${k}@lumenlabs.test`)));
    // Maya is also an Admin in the fixtures; act as her PM role so data scopes apply.
    maya = applyViewAs(maya, "PM");
  });
  afterAll(() => t?.drop());

  it("AC-1 the delivery schema is tenant-isolated", async () => {
    expect(await tablesMissingRls(t.owner)).toEqual([]);
  });

  it("AC-1 fixtures follow fixtures.md", async () => {
    const projects = await listProjects(maya);
    expect(projects.map((p) => [p.key, p.client, p.sprintDone, p.sprintTotal])).toEqual([["CON", "Contoso", 9, 16], ["FLT", "Wide World Importers", 5, 16], ["HRI", "Northwind HR", 14, 17]]);
    expect(projects.reduce((n, p) => n + (p.contractValue ?? 0), 0)).toBe(774000);
    const counts = await phaseCounts(maya, new Date("2026-10-16T15:00:00Z"));
    expect(counts).toEqual({ proposed: 6, planned: 4, building: 18, verified: 9, inFlight: 37, releasedThisMonth: 5 });
    const board = (await getProject(maya, "CON"))!.proposals;
    const lane = (ph: string) => board.filter((p) => p.phase === ph).map((p) => p.key).sort();
    expect([lane("proposed"), lane("planned"), lane("building"), lane("verified"), lane("released")]).toEqual([["CON-016", "CON-017"], ["CON-013"], ["CON-011", "CON-014"], ["CON-010", "CON-012"], ["CON-009"]]);
    const rel = await listReleases(maya);
    expect(rel.map((r) => `${r.projectKey} ${r.version} ${r.proposals}`)).toEqual(["CON v2.5.0 3", "CON v2.4.0 2", "FLT v1.8.0 5", "CON v2.3.0 1", "HRI v0.9.2 4"]);
  });

  it("AC-5 contract lookups", async () => {
    const refs = await withTenant(app, T, (tx) => listProjectRefs(tx));
    expect(refs.map((r) => r.key)).toEqual(["CON", "FLT", "HRI"]);
    expect((await withTenant(app, T, (tx) => getProjectRef(tx, "FLT")))?.name).toBe("Fleet Tracker");
    expect(maya.managedProjects).toHaveLength(1);
  });

  it("AC-3 Move is explicit, scoped to the PM's projects and audited with an event", async () => {
    await moveProposal(ctxFor(maya), { key: "CON-016", to: "planned" });
    await expect(moveProposal(ctxFor(maya), { key: "FLT-015", to: "planned" })).rejects.toThrow(/outside your data scope/);
    await expect(moveProposal(ctxFor(liam), { key: "CON-017", to: "planned" })).rejects.toThrow(/forbidden/);
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select before, after, actor from core.audit_event where action = 'delivery.proposal.move' order by seq desc limit 1`));
    expect(audit).toMatchObject({ before: { phase: "proposed" }, after: { phase: "planned" }, actor: `user:${maya.userId}` });
    const [ev] = await withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.proposalPhaseChanged} order by created_at desc limit 1`));
    expect(ev.payload).toMatchObject({ key: "CON-016", from: "proposed", to: "planned" });
  });

  it("AC-3 Released means Prod: a board move can't release, a Prod deployment does", async () => {
    await expect(moveProposal(ctxFor(sahan), { key: "CON-012", to: "released" as never })).rejects.toThrow(/invalid input/);
    await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "UAT", status: "deployed" });
    expect((await listProposals(sahan, { projectKey: "CON", phase: "released" })).map((p) => p.key)).toEqual(["CON-009"]);
    const r = await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod" });
    expect(r.released).toBe(true);
    expect((await listProposals(sahan, { projectKey: "CON", phase: "released" })).map((p) => p.key).sort()).toEqual(["CON-009", "CON-010", "CON-012"]);
    await expect(moveProposal(ctxFor(sahan), { key: "CON-010", to: "building" })).rejects.toThrow(/in Prod/);
    const events = await withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.releaseDeployed} order by created_at`));
    expect(events.map((e) => (e.payload as { released: boolean }).released)).toEqual([false, true]);
  });

  it("next release step: promote, retry after a rollback, nothing once live", async () => {
    const rel = await listReleases(maya);
    const step = (key: string) => nextStep(rel.find((r) => `${r.projectKey} ${r.version}` === key)!);
    expect(step("FLT v1.8.0")).toMatchObject({ label: "Retry UAT", environment: "UAT" });
    expect(step("HRI v0.9.2")).toBeNull();
    expect(step("CON v2.5.0")).toMatchObject({ label: "Deploy to Dev" });
  });

  it("AC-4 MCP tools run as the caller: record_deployment needs PM on that project or Admin", async () => {
    const tool = (n: string) => mcpTools.find((t) => t.name === n)!;
    expect(((await tool("list_projects").run(nimal as never, {} as never, "mcp")) as unknown[]).length).toBe(3);
    await expect(tool("record_deployment").run(maya as never, { projectKey: "FLT", version: "v1.8.0", environment: "UAT" } as never, "mcp")).rejects.toThrow(/data scope/);
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select source from core.audit_event where action = 'delivery.deployment.record' order by seq desc limit 1`));
    expect(row.source).toBe("ui");
    await tool("record_deployment").run(sahan as never, { projectKey: "FLT", version: "v1.8.0", environment: "UAT" } as never, "mcp");
    const [mcp] = await withTenant(app, T, (tx) => tx.execute(sql`select source from core.audit_event where action = 'delivery.deployment.record' order by seq desc limit 1`));
    expect(mcp.source).toBe("mcp");
  });

  it("roles without delivery:read are refused", async () => {
    await expect(listProjects(liam)).rejects.toThrow(/forbidden/);
  });
});
