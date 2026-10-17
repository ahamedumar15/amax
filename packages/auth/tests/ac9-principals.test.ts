import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, defineService, ForbiddenError } from "@amax/core/server";
import { installAuthorizer, setGrants } from "../src/can";
import { upsertPasswordUser } from "../src/password";
import { authenticateToken, createApiToken, createPrincipal, principalContext, type Principal } from "../src/principals";
import { revokeUser } from "../src/revoke";
import { viewerForUser } from "../src/session";

const T = "eeeeeeee-0000-4000-8000-00000000000e";

const syncProposal = defineService({
  name: "delivery.proposal.sync",
  action: "delivery:proposal:sync",
  resource: "delivery.proposal",
  input: z.object({ key: z.string() }),
  run: async (_tx, input) => ({ result: input.key, resourceId: input.key, after: input }),
});

describe.skipIf(!hasDb)("AC-9 service principals and tokens", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: string, kasun: string, liam: string;
  let principal: Principal;
  let spToken: string;

  const refusals = async () => (await withTenant(app, T, (tx) => tx.execute(sql`select after->>'reason' as reason from core.audit_event where action = 'auth.principal.refused' order by seq`))).map((r) => r.reason);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([{ grants: { PM: ["delivery:proposal:sync"], Engineer: ["delivery:proposal:sync"] } }]);
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    maya = await upsertPasswordUser(app, T, { email: "maya@lumen.test", name: "Maya", roles: ["Admin", "PM"], password: "maya-password-1" });
    kasun = await upsertPasswordUser(app, T, { email: "kasun@lumen.test", name: "Kasun", roles: ["Engineer"], password: "kasun-password-1" });
    liam = await upsertPasswordUser(app, T, { email: "liam@lumen.test", name: "Liam", roles: ["Sales"], password: "liam-password-12" });
    const owner = (await withTenant(app, T, (tx) => viewerForUser(tx, T, maya)))!;
    ({ token: spToken } = await createPrincipal(app, owner, { name: "specclaw", scopes: ["delivery:proposal:*"], actsFor: [kasun, liam], days: 90 }));
    const id = await authenticateToken(app, spToken);
    if (id?.kind !== "principal") throw new Error("expected a principal");
    principal = id.principal;
  });
  afterAll(() => t?.drop());

  it("only Admins create principals, with an owner, scopes and a bounded expiry", async () => {
    const k = (await withTenant(app, T, (tx) => viewerForUser(tx, T, kasun)))!;
    await expect(createPrincipal(app, k, { name: "x", scopes: ["a:b"], actsFor: [], days: 30 })).rejects.toBeInstanceOf(ForbiddenError);
    const m = (await withTenant(app, T, (tx) => viewerForUser(tx, T, maya)))!;
    await expect(createPrincipal(app, m, { name: "y", scopes: ["a:b"], actsFor: [], days: 400 })).rejects.toThrow(/1–365/);
    expect(principal).toMatchObject({ name: "specclaw", ownerUserId: maya, scopes: ["delivery:proposal:*"] });
  });

  it("a call inside its scopes, for someone it may act for, runs and is audited as the principal for that person", async () => {
    const ctx = await principalContext(app, principal, "delivery:proposal:sync", kasun);
    expect(await syncProposal(ctx, { key: "CON-014" })).toBe("CON-014");
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select actor, on_behalf_of, source from core.audit_event where action = 'delivery.proposal.sync'`));
    expect(row).toEqual({ actor: `sp:${principal.id}`, on_behalf_of: kasun, source: "api" });
  });

  it("refuses and audits: outside scopes, someone not on its list, and a person who lacks the permission", async () => {
    await expect(principalContext(app, principal, "payroll:payslip:read")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(principalContext(app, principal, "delivery:proposal:sync", maya)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(principalContext(app, principal, "delivery:proposal:sync", liam)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await refusals()).toEqual(["outside scopes", "not allowed to act for this person", "the person may not do this"]);
  });

  it("expired or revoked principals stop authenticating", async () => {
    await expect(principalContext(app, { ...principal, expiresAt: new Date(Date.now() - 1000) }, "delivery:proposal:sync")).rejects.toThrow(/expired/);
    await withTenant(app, T, (tx) => tx.execute(sql`update auth.service_principal set revoked_at = now() where id = ${principal.id}`));
    expect(await authenticateToken(app, spToken)).toBeNull();
  });

  it("personal API and MCP tokens act as their user until the user is deactivated", async () => {
    const k = (await withTenant(app, T, (tx) => viewerForUser(tx, T, kasun)))!;
    const mcp = await createApiToken(app, k, { kind: "mcp", name: "laptop", days: 30 });
    expect(mcp).toMatch(/^amx_mcp_/);
    const id = await authenticateToken(app, mcp);
    expect(id?.kind === "user" && id.viewer.userId).toBe(kasun);
    await revokeUser(app, T, kasun, { deactivate: true, reason: "test" });
    expect(await authenticateToken(app, mcp)).toBeNull();
    expect(await authenticateToken(app, "amx_api_unknown")).toBeNull();
  });

  it("tokens are stored only as hashes", async () => {
    const rows = await t.owner`select token_hash from auth.service_principal union all select token_hash from auth.api_token`;
    expect(JSON.stringify(rows)).not.toContain(spToken);
  });
});
