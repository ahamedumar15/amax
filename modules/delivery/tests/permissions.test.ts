import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, defineService } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { moveProposal } from "../server/services";

const T = lumen.tenant.id;

// Review round 1: "@managed" must work for a real, non-Admin PM (loaded from a session), and the
// up-front authorize step must stay strict for services that don't check the record themselves.
describe.skipIf(!hasDb)("data scopes through the real viewer path", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery, { grants: { PM: ["x:touch@managed"] } }]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    // Nimal manages FLT (fixtures) but holds Engineer only; make him a PM, not an Admin.
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source)
      select ${T}, id, 'PM', 'manual' from auth.user where email = 'nimal@lumenlabs.test'`));
  });
  afterAll(() => t?.drop());

  const pmViewer = async () => {
    const s = await signInDemo(app, T, "nimal@lumenlabs.test");
    return (await loadViewer(app, T, s.sessionId))!;
  };

  it("a PM loaded from a session gets their managed projects and can move on them only", async () => {
    const nimal = await pmViewer();
    expect(nimal.actualRoles).not.toContain("Admin");
    expect(nimal.managedProjects).toHaveLength(1);
    await expect(moveProposal(ctxFor(nimal), { key: "FLT-015", to: "planned" })).resolves.toMatchObject({ phase: "planned" });
    await expect(moveProposal(ctxFor(nimal), { key: "CON-016", to: "planned" })).rejects.toThrow(/data scope/);
  });

  it("an unscoped service refuses a qualified grant up front; a scoped one lets the record check decide", async () => {
    const nimal = await pmViewer();
    const run = async () => ({ result: "ok" });
    const strict = defineService({ name: "x.touch", action: "x:touch", resource: "x", input: z.object({}), run });
    const scoped = defineService({ name: "x.touch", action: "x:touch", resource: "x", input: z.object({}), scoped: true, run });
    await expect(strict(ctxFor(nimal), {})).rejects.toThrow(/forbidden/);
    await expect(scoped(ctxFor(nimal), {})).resolves.toBe("ok");
  });
});
