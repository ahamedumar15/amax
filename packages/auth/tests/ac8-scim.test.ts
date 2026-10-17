import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { authConfig } from "../src/authjs";
import { authEventHandlers } from "../src/events";
import { upsertPasswordUser, signInPassword } from "../src/password";
import { createScimToken, scimHandler } from "../src/scim";
import { loadViewer } from "../src/session";
import { tokenHash } from "../src/tokens";

const A = "dddddddd-0000-4000-8000-00000000000a";
const B = "dddddddd-0000-4000-8000-00000000000b";
const base = "https://amax.test/api/scim/v2";

describe.skipIf(!hasDb)("AC-8 SCIM provisioning and revocation", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let tokenA: string;
  let tokenB: string;

  const call = (token: string, method: string, path: string, body?: unknown, id?: string) =>
    scimHandler(app, new Request(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/scim+json" }, body: body ? JSON.stringify(body) : undefined }), id);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${A}, 'A'), (${B}, 'B')`;
    tokenA = await createScimToken(app, A);
    tokenB = await createScimToken(app, B);
  });
  afterAll(() => t?.drop());

  it("refuses a missing or unknown token", async () => {
    expect((await scimHandler(app, new Request(`${base}/Users`))).status).toBe(401);
    expect((await call("amx_scim_nope", "GET", "/Users")).status).toBe(401);
  });

  it("creates, finds by userName and reads a user; duplicates conflict", async () => {
    const res = await call(tokenA, "POST", "/Users", { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "Kasun@Lumen.test", name: { givenName: "Kasun", familyName: "Dias" }, externalId: "e-1", active: true });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({ userName: "kasun@lumen.test", displayName: "Kasun Dias", active: true, externalId: "e-1" });
    expect((await call(tokenA, "POST", "/Users", { userName: "kasun@lumen.test" })).status).toBe(409);
    const list = await (await call(tokenA, "GET", `/Users?filter=${encodeURIComponent('userName eq "kasun@lumen.test"')}`)).json();
    expect(list.totalResults).toBe(1);
    expect((await (await call(tokenA, "GET", `/Users/${created.id}`, undefined, created.id)).json()).id).toBe(created.id);
  });

  it("a tenant's token sees only its own users", async () => {
    const list = await (await call(tokenB, "GET", "/Users")).json();
    expect(list.totalResults).toBe(0);
  });

  it("deactivation revokes sessions and API/MCP tokens at once, and the web session ends at the next check", async () => {
    await upsertPasswordUser(app, A, { email: "nimal@lumen.test", name: "Nimal Silva", roles: ["Engineer"], password: "nimal-password-1" });
    const s = await signInPassword(app, A, "nimal@lumen.test", "nimal-password-1");
    await withTenant(app, A, (tx) => tx.execute(sql`insert into auth.api_token (tenant_id, user_id, kind, name, token_hash, expires_at)
      values (${A}, ${s.userId}, 'mcp', 'laptop', ${tokenHash("amx_mcp_x")}, now() + interval '30 days'), (${A}, ${s.userId}, 'api', 'ci', ${tokenHash("amx_api_y")}, now() + interval '30 days')`));

    // What a browser JWT looks like a little over a minute after sign-in.
    const cfg = await authConfig({ db: app, secret: "s".repeat(32) });
    const jwt = cfg.callbacks!.jwt! as (a: unknown) => Promise<unknown>;
    const token = { tenantId: A, userId: s.userId, sessionId: s.sessionId, checkedAt: Date.now() - 61_000 };
    expect(await jwt({ token })).not.toBeNull();

    // Entra's PATCH shape.
    const res = await call(tokenA, "PATCH", `/Users/${s.userId}`, { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "Replace", path: "active", value: "False" }] }, s.userId);
    expect((await res.json()).active).toBe(false);

    expect(await loadViewer(app, A, s.sessionId)).toBeNull();
    expect(await jwt({ token })).toBeNull();
    const live = await t.owner`select count(*)::int as n from auth.api_token where revoked_at is null`;
    expect(live[0].n).toBe(0);
    const [audit] = await withTenant(app, A, (tx) => tx.execute(sql`select after from core.audit_event where action = 'auth.user.revoke' order by seq desc limit 1`));
    expect(audit.after).toMatchObject({ deactivated: true, sessions: 1, tokens: 2, reason: "scim" });
  });

  it("Okta's PATCH shape reactivates; DELETE deactivates", async () => {
    const [{ id }] = await withTenant(app, A, (tx) => tx.execute(sql`select id from auth.user where email = 'nimal@lumen.test'`));
    const on = await call(tokenA, "PATCH", `/Users/${id}`, { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", value: { active: true } }] }, id as string);
    expect((await on.json()).active).toBe(true);
    expect((await call(tokenA, "DELETE", `/Users/${id}`, undefined, id as string)).status).toBe(204);
    const [u] = await withTenant(app, A, (tx) => tx.execute(sql`select status from auth.user where id = ${id}`));
    expect(u.status).toBe("deactivated");
  });

  it("hr.person.left revokes access through the outbox", async () => {
    await upsertPasswordUser(app, A, { email: "rizwan@lumen.test", name: "Rizwan Farook", roles: ["Employee"], password: "rizwan-password-1" });
    const s = await signInPassword(app, A, "rizwan@lumen.test", "rizwan-password-1");
    await withTenant(app, A, (tx) => tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${A}, 'hr.person.left', ${JSON.stringify({ email: "rizwan@lumen.test" })}::jsonb)`));
    await runDueJobs(app, registryFrom([{ id: "auth", events: { handles: authEventHandlers } }]));
    expect(await loadViewer(app, A, s.sessionId)).toBeNull();
  });
});
