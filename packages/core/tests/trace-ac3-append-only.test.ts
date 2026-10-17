import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { appendAudit, appendTrace, configureRuntime, contextFor } from "../src/server";

const T = "00000000-0000-4000-8000-000000000a03";
const TABLES = ["ai.call", "core.trace_event", "core.audit_event"] as const;

describe.skipIf(!hasDb)("050 AC-2 AC-3 append-only for amax_app", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const pgError = (p: Promise<unknown>) => p.then(() => "", (e) => String(e?.cause?.message ?? e?.message));
  const asApp = (q: ReturnType<typeof sql>) => pgError(withTenant(app, T, (tx) => tx.execute(q)));

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'T')`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    const trace = { traceId: "00000000-0000-4000-8000-0000000000f1", tenantId: T, actor: "user:maya", source: "chat" as const };
    await withTenant(app, T, async (tx) => {
      await appendAudit(tx, contextFor.ui(T, { id: "user:maya" }), { action: "x.update", resource: "x", resourceId: "1", after: { n: 1 } });
      await appendTrace(tx, trace, { kind: "turn", recordId: "c1" });
      await tx.execute(sql`insert into ai.call (tenant_id, caller, source, purpose, model, ok) values (${T}, 'user:maya', 'chat', 'chat', 'm', true)`);
    });
  });
  afterAll(() => t?.drop());

  it("AC-3 UPDATE and DELETE fail as amax_app on ai.call, core.trace_event and core.audit_event, by grant and by trigger", async () => {
    const [role] = await withTenant(app, T, (tx) => tx.execute(sql`select current_user as u`));
    expect(role.u).toBe("amax_app");
    for (const table of TABLES) {
      const [{ n }] = await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from ${sql.raw(table)}`));
      expect(n, `${table} has a row to change`).toBe(1);
      expect(await asApp(sql`update ${sql.raw(table)} set tenant_id = tenant_id`)).toMatch(/permission denied/);
      expect(await asApp(sql`delete from ${sql.raw(table)}`)).toMatch(/permission denied/);
    }
    await t.owner.unsafe(`grant update, delete on ${TABLES.join(", ")} to amax_app`);
    for (const table of TABLES) {
      expect(await asApp(sql`update ${sql.raw(table)} set tenant_id = tenant_id`), table).toMatch(/append-only/);
      expect(await asApp(sql`delete from ${sql.raw(table)}`), table).toMatch(/append-only/);
      const [{ n }] = await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from ${sql.raw(table)}`));
      expect(n).toBe(1);
    }
    await t.owner.unsafe(`revoke update, delete on ${TABLES.join(", ")} from amax_app`);
  });

  it("AC-2 the trace chain refuses every role; ai.call still lets the owner's migrations change it", async () => {
    expect(await pgError(t.owner`update core.trace_event set tool = 'x'`)).toMatch(/append-only/);
    expect(await pgError(t.owner`delete from core.trace_event`)).toMatch(/append-only/);
    expect(await pgError(t.owner`truncate core.trace_event`)).toMatch(/append-only/);
    expect(await pgError(t.owner.begin(async (tx) => {
      await tx`alter table ai.call add column later_col text`;
      await tx`update ai.call set later_col = 'backfilled'`;
    }))).toBe("");
  });
});
