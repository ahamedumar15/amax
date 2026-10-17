import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { appendAudit } from "../src/audit";
import { configureRuntime, contextFor, verifyAuditChain } from "../src/server";

const T = "00000000-0000-4000-8000-0000000000c7";
const U = "00000000-0000-4000-8000-0000000000c8";

describe.skipIf(!hasDb)("AC-7 append-only, hash-chained audit", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const pgError = (p: Promise<unknown>) => p.then(() => "", (e) => String(e?.cause?.message ?? e?.message));

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'T'), (${U}, 'U')`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    for (const tenant of [T, U]) {
      for (let i = 0; i < 5; i++) {
        await withTenant(app, tenant, (tx) => appendAudit(tx, contextFor.ui(tenant, { id: "user:maya" }), { action: "x.update", resource: "x", resourceId: String(i), after: { n: i, nested: { b: 1, a: [1, 2] }, dropped: undefined, at: new Date(0) } }));
      }
    }
  });
  afterAll(() => t?.drop());

  const verify = (tenant: string) => withTenant(app, tenant, (tx) => verifyAuditChain(tx, tenant));

  it("chains per tenant and verifies", async () => {
    expect(await verify(T)).toMatchObject({ ok: true, length: 5 });
    expect(await verify(U)).toMatchObject({ ok: true, length: 5 });
  });

  it("concurrent writers still form one unbroken chain", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      withTenant(app, T, (tx) => appendAudit(tx, contextFor.job(T, "parallel"), { action: "x.parallel", resource: "x", resourceId: String(i) }))));
    expect(await verify(T)).toMatchObject({ ok: true, length: 15 });
  });

  it("the owner can't update, delete or truncate either", async () => {
    expect(await pgError(t.owner`update core.audit_event set actor = 'x'`)).toMatch(/append-only/);
    expect(await pgError(t.owner`delete from core.audit_event`)).toMatch(/append-only/);
    expect(await pgError(t.owner`truncate core.audit_event`)).toMatch(/append-only/);
  });

  it("an edit made by bypassing the trigger breaks the chain at that row", async () => {
    await t.owner.begin(async (tx) => {
      await tx`alter table core.audit_event disable trigger audit_append_only`;
      await tx`update core.audit_event set after = '{"n": 99}' where tenant_id = ${U} and seq = 3`;
      await tx`alter table core.audit_event enable trigger audit_append_only`;
    });
    expect(await verify(U)).toEqual({ ok: false, brokenAt: 3, reason: "value mismatch" });
  });

  it("a deleted row breaks the chain", async () => {
    await t.owner.begin(async (tx) => {
      await tx`alter table core.audit_event disable trigger audit_append_only`;
      await tx`delete from core.audit_event where tenant_id = ${T} and seq = 2`;
      await tx`alter table core.audit_event enable trigger audit_append_only`;
    });
    expect(await verify(T)).toEqual({ ok: false, brokenAt: 2, reason: "missing row" });
  });

  it("the app role can still insert after all that", async () => {
    const r = await pgError(withTenant(app, T, (tx) => tx.execute(sql`select 1`)));
    expect(r).toBe("");
  });
});
