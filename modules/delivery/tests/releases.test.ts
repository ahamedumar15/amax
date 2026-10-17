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
    await expect(removeEnvironment(ctxFor(sahan), { projectKey: "CON", name: "Dev" })).rejects.toThrow(/has deployments/);
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
