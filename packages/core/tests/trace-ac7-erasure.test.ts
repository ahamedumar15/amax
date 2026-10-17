import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { appendAudit, appendTrace, configureRuntime, contextFor, verifyAuditChain, verifyTraceChain } from "../src/server";

const T = "00000000-0000-4000-8000-000000000a07";
const ANA = "user:00000000-0000-4000-8000-0000000000aa";

describe.skipIf(!hasDb)("050 AC-7 erasure keeps both chains verifiable", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const pgError = (p: Promise<unknown>) => p.then(() => "", (e) => String(e?.cause?.message ?? e?.message));
  const chains = () => withTenant(app, T, async (tx) => ({ audit: await verifyAuditChain(tx, T), trace: await verifyTraceChain(tx, T) }));

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'T')`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    const trace = { traceId: "00000000-0000-4000-8000-0000000000f7", tenantId: T, actor: ANA, source: "chat" as const };
    await withTenant(app, T, async (tx) => {
      await appendAudit(tx, contextFor.ui(T, { id: ANA }), { action: "hr.person.update", resource: "hr.person", resourceId: ANA, before: { name: "Ana Ruiz (fictional)" }, after: { name: "Ana R." } });
      await appendAudit(tx, contextFor.ui(T, { id: "user:maya" }), { action: "x.update", resource: "x", resourceId: "1", after: { n: 1 } });
      await appendTrace(tx, trace, { kind: "turn", recordId: "c1" });
      await appendTrace(tx, { ...trace, actor: "user:maya", onBehalfOf: ANA }, { kind: "tool_call", tool: "get_person", recordId: ANA, args: { id: ANA } });
    });
  });
  afterAll(() => t?.drop());

  it("AC-7 erasing a person nulls their raw values, keeps the keyed hashes, and both chains still verify", async () => {
    expect(await chains()).toMatchObject({ audit: { ok: true, erased: 0 }, trace: { ok: true, erased: 0 } });
    expect(await pgError(withTenant(app, T, (tx) => tx.execute(sql`select core.erase_subject(${ANA})`)))).toMatch(/permission denied/);
    const [{ n }] = await t.owner.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${T}, true)`;
      return tx`select core.erase_subject(${ANA}) as n`;
    });
    expect(n).toBe(3);
    const raw = await t.owner`select concat_ws(' ', actor, on_behalf_of, resource_id, before::text, after::text) as s from core.audit_event
      union all select concat_ws(' ', actor, on_behalf_of, record_id) from core.trace_event`;
    expect(raw.map((r) => r.s).join(" ")).not.toMatch(/0000000000aa|Ana/);
    const after = await chains();
    expect(after.audit).toMatchObject({ ok: true, length: 2 });
    expect(after.trace).toMatchObject({ ok: true, length: 2 });
    expect((after.audit as { erased: number }).erased + (after.trace as { erased: number }).erased).toBeGreaterThanOrEqual(6);
  });

  it("AC-7 the erasure path can't be used to change anything else", async () => {
    expect(await pgError(t.owner.begin(async (tx) => {
      await tx`select set_config('amax.erasing', 'on', true)`;
      await tx`update core.audit_event set action = 'forged' where seq = 2`;
    }))).toMatch(/append-only/);
    expect(await pgError(t.owner.begin(async (tx) => {
      await tx`select set_config('amax.erasing', 'on', true)`;
      await tx`update core.trace_event set actor = 'user:someone-else' where seq = 2`;
    }))).toMatch(/append-only/);
  });
});
