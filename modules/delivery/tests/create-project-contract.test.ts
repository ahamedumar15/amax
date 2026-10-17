import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, withIdempotency } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { createProject, createProjectInTx, getProjectRef, PROJECT_CREATE_PERMISSION } from "../contracts";
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

  it("AC-2 a sourceRef makes one project, also when creates retry or race", async () => {
    const source = "presales.opportunity:OPP0042";
    const made = await createProject(ctxFor(admin), { key: "SRA", name: "A", client: "x", billing: "fixed", sourceRef: source });
    await expect(createProject(ctxFor(admin), { key: "SRB", name: "B", client: "x", billing: "fixed", sourceRef: source }))
      .resolves.toEqual({ id: made.id, key: "SRA", existing: true });
    const race = await Promise.all(["SRC", "SRD"].map((key) => createProject(ctxFor(admin), { key, name: key, client: "x", billing: "fixed", sourceRef: "race:1" })));
    expect(race[0].id).toBe(race[1].id);
    expect(race.filter((r) => r.existing)).toHaveLength(1);
    expect(await bySource("race:1")).toHaveLength(1);
    expect(await ref("SRB")).toBeNull();
  });

  it("AC-3 createProjectInTx commits or rolls back with the caller, audited, in the caller's tenant only", async () => {
    const input = { key: "TXA", name: "Tx", client: "x", billing: "retainer" as const };
    await expect(withTenant(app, T, async (tx) => { await createProjectInTx(tx, ctxFor(admin), input); throw new Error("caller failed"); })).rejects.toThrow("caller failed");
    expect(await ref("TXA")).toBeNull();
    const made = await withTenant(app, T, (tx) => createProjectInTx(tx, ctxFor(admin), input));
    expect((await ref("TXA"))?.id).toBe(made.id);
    const audit = await withTenant(app, T, (tx) => tx.execute(sql`select action from core.audit_event where resource_id = ${made.id}`));
    expect(audit.map((a) => a.action)).toEqual(["delivery.project.create"]);
    await expect(app.transaction((tx) => createProjectInTx(tx, ctxFor(admin), { ...input, key: "TXB" }))).rejects.toThrow(/withTenant/);
  });

  it("AC-4 the published permission gates both entry points; bad input is refused", async () => {
    expect(delivery.permissions).toContain(PROJECT_CREATE_PERMISSION);
    const input = { key: "NOP", name: "No", client: "x", billing: "fixed" as const };
    await expect(createProject(ctxFor(engineer), input)).rejects.toThrow(/forbidden: delivery:project:create/);
    await expect(withTenant(app, T, (tx) => createProjectInTx(tx, ctxFor(engineer), input))).rejects.toThrow(/forbidden/);
    await expect(withTenant(app, T, (tx) => createProjectInTx(tx, ctxFor(admin), { ...input, key: "no" }))).rejects.toThrow(/invalid input/);
  });
});
