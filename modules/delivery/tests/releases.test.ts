import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, viewerForUser, type Viewer, setViewerScopeResolvers } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { managedProjectIds } from "../contracts";
import { ctxFor } from "../server/context";
import { getRelease, listEnvironments, listProposals, listReleases } from "../server/queries";
import { createProject, createRelease, recordDeployment, removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "../server/services";

const T = lumen.tenant.id;

describe.skipIf(!hasDb)("042 release management (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, sahan: Viewer;
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return v;
  };
  const envNames = async (key: string) => (await listEnvironments(sahan, key)).map((e) => `${e.name}${e.isProd ? "*" : ""}`);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    // Managed projects come from the real resolver, as in the app (not planted on the viewer).
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    sahan = await as("sahan@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-1 each project has its own environments; new projects get Dev, QA, UAT, Prod", async () => {
    expect(await envNames("CON")).toEqual(["Dev", "QA", "UAT", "Prod*"]);
    await createProject(ctxFor(sahan), { key: "LAB", name: "Lab", client: "Internal", billing: "internal" });
    expect(await envNames("LAB")).toEqual(["Dev", "QA", "UAT", "Prod*"]);
  });

  it("AC-1 add, rename, reorder, mark Prod or none, and remove only when unused", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "UAT", rename: "Staging" });
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Preview", position: 2 });
    expect(await envNames("LAB")).toEqual(["Dev", "Preview", "QA", "Staging", "Prod*"]);
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Staging", isProd: true });
    expect(await envNames("LAB")).toEqual(["Dev", "Preview", "QA", "Staging*", "Prod"]);
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Staging", isProd: false });
    expect((await envNames("LAB")).some((n) => n.endsWith("*"))).toBe(false);
    await removeEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Prod" });
    await expect(removeEnvironment(ctxFor(sahan), { projectKey: "CON", name: "Dev" })).rejects.toThrow(/deployment records? .*kept as history/);
    await expect(upsertEnvironment(ctxFor(maya), { projectKey: "FLT", name: "X" })).rejects.toThrow(/data scope/);
  });

  it("AC-2 a Dev-only project: deploy to any environment; no Prod means nothing is released", async () => {
    await createRelease(ctxFor(sahan), { projectKey: "LAB", version: "v0.1.0", proposalKeys: [] });
    const r = await recordDeployment(ctxFor(sahan), { projectKey: "LAB", version: "v0.1.0", environment: "staging" });
    expect(r.released).toBe(false);
    await expect(recordDeployment(ctxFor(sahan), { projectKey: "LAB", version: "v0.1.0", environment: "Prod" })).rejects.toThrow(/no environment Prod/);
  });

  it("AC-2 tag and proposals are editable; Prod can be reached directly", async () => {
    await tagRelease(ctxFor(maya), { projectKey: "CON", version: "v2.5.0", newVersion: "v2.6.0" });
    await setReleaseProposals(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", proposalKeys: ["CON-014", "CON-016"] });
    const rel = await getRelease(maya, "CON", "v2.6.0");
    expect(rel!.proposals.filter((p) => p.included).map((p) => p.key)).toEqual(["CON-014", "CON-016"]);
    const out = await recordDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod" });
    expect(out.released).toBe(true);
    expect((await listProposals(maya, { projectKey: "CON", phase: "released" })).map((p) => p.key).sort()).toEqual(["CON-009", "CON-014", "CON-016"]);
  });

  it("AC-3 voiding the only Prod deployment un-releases; history keeps the voided record; the map ignores it", async () => {
    await voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod", reason: "recorded by mistake" });
    expect((await listProposals(maya, { projectKey: "CON", phase: "released" })).map((p) => p.key)).toEqual(["CON-009"]);
    const rel = await getRelease(maya, "CON", "v2.6.0");
    expect(rel!.history[0]).toMatchObject({ environment: "Prod", voidReason: "recorded by mistake" });
    const map = (await listReleases(maya)).find((r) => r.version === "v2.6.0")!;
    expect(map.stages.find((s) => s.environment === "Prod")!.status).toBeNull();
    const [a] = await withTenant(app, T, (tx) => tx.execute(sql`select after from core.audit_event where action = 'delivery.deployment.void' order by seq desc limit 1`));
    expect(a.after).toMatchObject({ reason: "recorded by mistake" });
    await expect(voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod", reason: "again" })).rejects.toThrow(/to void/);
  });
});

describe.skipIf(!hasDb)("voiding only un-releases through the record that released (review round 1)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let sahan: Viewer;
  const released = async (key: string) => (await listProposals(sahan, { projectKey: key, phase: "released" })).map((p) => p.key).sort();

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    sahan = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod" });
  });
  afterAll(() => t?.drop());

  it("voiding a Dev deployment after Prod is unmarked leaves Released alone", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "CON", name: "Prod", isProd: false });
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Dev", reason: "dev redo" });
    expect(await released("CON")).toEqual(["CON-009", "CON-010", "CON-012"]);
  });

  it("voiding a QA deployment after Prod moved to another environment leaves Released alone", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "CON", name: "UAT", isProd: true });
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "QA", reason: "qa redo" });
    expect(await released("CON")).toEqual(["CON-009", "CON-010", "CON-012"]);
  });

  it("voiding the deployment that released them un-releases", async () => {
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod", reason: "wrong pipeline" });
    expect(await released("CON")).toEqual(["CON-009"]);
  });

  it("a shipped proposal can't be moved into another release; unknown keys are refused in both paths", async () => {
    // v0.9.2 is live in Prod: it keeps its own proposals but takes no new one (final review).
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-100", "HRI-101", "HRI-102", "HRI-103", "HRI-001"] })).rejects.toThrow(/already live in Prod; put HRI-001 in a new release/);
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-104"] })).rejects.toThrow(/already shipped/);
    await expect(createRelease(ctxFor(sahan), { projectKey: "HRI", version: "v1.0.0", proposalKeys: ["HRI-100"] })).rejects.toThrow(/already shipped/);
    await expect(createRelease(ctxFor(sahan), { projectKey: "HRI", version: "v1.0.1", proposalKeys: ["HRI-999"] })).rejects.toThrow(/no proposal HRI-999/);
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-999"] })).rejects.toThrow(/no proposal HRI-999/);
  });
});

describe("release columns agree with every project's stage order (review round 2)", async () => {
  const { stageColumns } = await import("../server/queries");
  const rel = (...envs: string[]) => ({ stages: envs.map((environment, i) => ({ environment, position: i + 1, isProd: false, status: null, at: null, note: null, run: null })) }) as never;
  it.each([
    ["same order", [rel("Dev", "QA", "Prod"), rel("Dev", "QA", "Prod")], ["Dev", "QA", "Prod"]],
    ["QA at 2 in one project, 3 in another", [rel("Dev", "QA", "Prod"), rel("Dev", "UAT", "QA", "Prod")], ["Dev", "UAT", "QA", "Prod"]],
    ["the longer project listed first", [rel("Dev", "UAT", "QA", "Prod"), rel("QA", "Prod")], ["Dev", "UAT", "QA", "Prod"]],
    ["disjoint stages", [rel("Dev", "Prod"), rel("Staging")], ["Dev", "Staging", "Prod"]],
    ["projects contradict each other: still every name once", [rel("A", "B"), rel("B", "A")], ["A", "B"]],
  ])("%s", (_n, releases, expected) => expect(stageColumns(releases as never)).toEqual(expected));
});

describe("release map rows follow the project's own order (review round 3)", async () => {
  const { stageColumns } = await import("../server/queries");
  const { mapRow } = await import("../ui/ReleasesPage");
  const rel = (...envs: [string, string | null][]) => ({ stages: envs.map(([environment, status], i) => ({ environment, position: i + 1, isProd: false, status, at: null, note: null, run: null })) }) as never;
  it("orders that agree: stations under their columns, line to the furthest reached", () => {
    const a = rel(["Dev", "deployed"], ["QA", "deployed"], ["Prod", null]);
    const b = rel(["Dev", "deployed"], ["UAT", null], ["QA", null], ["Prod", null]);
    const cols = stageColumns([a, b]);
    expect(mapRow(a, cols)).toMatchObject({ agrees: true, lineTo: cols.indexOf("QA"), aheadTo: cols.indexOf("Prod"), back: false });
  });
  it("opposite orders: the contradicting row is drawn by its own order, reaching only what it reached", () => {
    const a = rel(["A", "deployed"], ["B", null]);
    const b = rel(["B", "deployed"], ["A", null]);
    const cols = stageColumns([a, b]);
    const rows = [mapRow(a, cols), mapRow(b, cols)];
    const bad = rows.find((r) => !r.agrees)!;
    expect(rows.filter((r) => r.agrees)).toHaveLength(1);
    expect(bad).toMatchObject({ lineTo: 0, aheadTo: 1 });
    expect(bad.stations.map((s) => [s.environment, s.slot, s.reached])).toEqual([["B", 0, true], ["A", 1, false]]);
  });
  it("a rollback is read from the last reached stage in the project's own order", () => {
    const a = rel(["Dev", "deployed"], ["QA", "rolled-back"], ["Prod", null]);
    expect(mapRow(a, ["Dev", "QA", "Prod"])).toMatchObject({ back: true, lineTo: 1 });
  });
});

describe.skipIf(!hasDb)("final review: release bugs", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let sahan: Viewer;
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    sahan = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  });
  afterAll(() => t?.drop());
  const ctx = () => ctxFor(sahan);

  it("environment names match without regard to case in every service, and the database enforces it", async () => {
    await createProject(ctx(), { key: "ENV", name: "Env", client: "x", billing: "internal" });
    await upsertEnvironment(ctx(), { projectKey: "ENV", name: "prod", isProd: true });
    expect((await listEnvironments(sahan, "ENV")).map((e) => e.name)).toEqual(["Dev", "QA", "UAT", "Prod"]);
    await createRelease(ctx(), { projectKey: "ENV", version: "v1", proposalKeys: [] });
    await recordDeployment(ctx(), { projectKey: "ENV", version: "v1", environment: "pRoD" });
    const [ev] = await t.owner`select payload from core.event where name = 'delivery.release.deployed' and payload->>'version' = 'v1' order by created_at desc limit 1`;
    expect(ev.payload.environment).toBe("Prod");
    await expect(t.owner`insert into delivery.environment (tenant_id, project_id, name, position) select ${T}, id, 'PROD', 9 from delivery.project where key = 'ENV'`).rejects.toThrow(/environment_name_ci/);
    await expect(removeEnvironment(ctx(), { projectKey: "ENV", name: "PROD" })).rejects.toThrow(/Prod has 1 deployment record .*kept as history/);
  });

  it("Void on a history row voids exactly that record", async () => {
    await createProject(ctx(), { key: "VID", name: "Vid", client: "x", billing: "internal" });
    await createRelease(ctx(), { projectKey: "VID", version: "v1", proposalKeys: [] });
    await recordDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev" });
    await recordDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev" });
    const history = (await getRelease(sahan, "VID", "v1"))!.history; // newest first
    await voidDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev", deploymentId: history[1].id, reason: "the older one" });
    const after = (await getRelease(sahan, "VID", "v1"))!.history;
    expect(after.find((d) => d.id === history[1].id)!.voidedAt).not.toBeNull();
    expect(after.find((d) => d.id === history[0].id)!.voidedAt).toBeNull();
    await createRelease(ctx(), { projectKey: "VID", version: "v2", proposalKeys: [] });
    await expect(voidDeployment(ctx(), { projectKey: "VID", version: "v2", environment: "Dev", deploymentId: history[0].id, reason: "wrong release" })).rejects.toThrow(/isn't a live Dev record of v2/);
    // The id and the environment must agree: a destructive call never voids a record elsewhere (round 13).
    await expect(voidDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Prod", deploymentId: history[0].id, reason: "mismatch" })).rejects.toThrow(/isn't a live Prod record of v1/);
    expect((await getRelease(sahan, "VID", "v1"))!.history.find((d) => d.id === history[0].id)!.voidedAt).toBeNull();
  });

  it("rename collisions are refused clearly; remove reports the stored name (round 13)", async () => {
    await createProject(ctx(), { key: "REN", name: "Ren", client: "x", billing: "internal" });
    await expect(upsertEnvironment(ctx(), { projectKey: "REN", name: "QA", rename: "dev" })).rejects.toThrow(/already has an environment called Dev/);
    await upsertEnvironment(ctx(), { projectKey: "REN", name: "QA", rename: "qa" });
    expect(await removeEnvironment(ctx(), { projectKey: "REN", name: "QA" })).toEqual({ removed: "qa" });
  });

  it("a Prod deployment and a change to the release's proposals don't interleave: the release row is locked (round 13)", async () => {
    await createProject(ctx(), { key: "LCK", name: "Lock", client: "x", billing: "internal" });
    await createRelease(ctx(), { projectKey: "LCK", version: "v1", proposalKeys: [] });
    let done = false;
    await t.owner.begin(async (tx) => {
      // A key-share lock is what a foreign-key insert takes; it blocks only an explicit row lock,
      // so this pins releaseOf's "for update", not just the deployment's foreign key.
      await tx`select 1 from delivery.release r where r.version = 'v1' and r.project_id = (select id from delivery.project where key = 'LCK') for key share`;
      const deploy = recordDeployment(ctx(), { projectKey: "LCK", version: "v1", environment: "Prod" }).then(() => { done = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(done).toBe(false);
      void deploy;
    });
    await expect.poll(() => done, { timeout: 5000 }).toBe(true);
  });

  it("migration 0008 merges names that differ only by case before indexing them (round 13)", async () => {
    await t.owner`drop index delivery.environment_name_ci`;
    const [p] = await t.owner`select id from delivery.project where key = 'VID'`;
    const [dup] = await t.owner`insert into delivery.environment (tenant_id, project_id, name, position) values (${T}, ${p.id}, 'DEV', 9) returning id`;
    const [rel] = await t.owner`select id from delivery.release where project_id = ${p.id} and version = 'v1'`;
    const [dep] = await t.owner`insert into delivery.deployment (tenant_id, release_id, environment_id, status, recorded_by) values (${T}, ${rel.id}, ${dup.id}, 'deployed', 'test') returning id`;
    await t.owner.unsafe(readFileSync(join(__dirname, "../db/migrations/0008_environment_name_ci.sql"), "utf8"));
    expect((await t.owner`select name from delivery.environment where project_id = ${p.id} and lower(name) = 'dev'`).map((e) => e.name)).toEqual(["Dev"]);
    const [moved] = await t.owner`select e.name from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.id = ${dep.id}`;
    expect(moved.name).toBe("Dev");
    expect(await t.owner`select 1 from pg_indexes where indexname = 'environment_name_ci'`).toHaveLength(1);
  });

  it("a release already live in Prod takes no new proposals; keeping its own is fine", async () => {
    await createProject(ctx(), { key: "LIV", name: "Live", client: "x", billing: "internal" });
    const { createProposal } = await import("../server/services");
    const a = await createProposal(ctx(), { projectKey: "LIV", title: "In the release" });
    const b = await createProposal(ctx(), { projectKey: "LIV", title: "Late" });
    await createRelease(ctx(), { projectKey: "LIV", version: "v1", proposalKeys: [a.key] });
    await recordDeployment(ctx(), { projectKey: "LIV", version: "v1", environment: "Prod" });
    await expect(setReleaseProposals(ctx(), { projectKey: "LIV", version: "v1", proposalKeys: [a.key, b.key] })).rejects.toThrow(/already live in Prod; put LIV-002 in a new release/);
    await setReleaseProposals(ctx(), { projectKey: "LIV", version: "v1", proposalKeys: [a.key] });
  });
});

describe("nextStep: only a deployed Prod is Live (final review)", async () => {
  const { nextStep } = await import("../ui/ReleasesPage");
  const st = (environment: string, position: number, isProd: boolean, status: string | null) => ({ environment, position, isProd, status, at: null, note: null, run: null });
  const rel = (...stages: ReturnType<typeof st>[]) => ({ stages }) as never;
  it.each([
    ["a gap in positions after a removal", rel(st("Dev", 1, false, "deployed"), st("UAT", 3, false, null), st("Prod", 4, true, null)), "Promote to UAT"],
    ["Prod still testing", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "testing")), "Finish Prod"],
    ["QA still testing (promotable, as in the mock)", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "testing"), st("Prod", 3, true, null)), "Promote to Prod"],
    ["a project with no Prod, every stage reached", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "deployed")), "No Prod stage"],
    ["a rollback", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "rolled-back")), "Retry QA"],
    ["nothing yet", rel(st("Dev", 1, false, null)), "Deploy to Dev"],
    ["Prod deployed", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "deployed")), null],
    ["a stage after Prod reached, Prod not yet (round 13)", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, null), st("Demo", 3, false, "deployed")), "Deploy to Prod"],
  ])("%s", (_n, r, label) => expect(nextStep(r)?.label ?? null).toBe(label));
});
