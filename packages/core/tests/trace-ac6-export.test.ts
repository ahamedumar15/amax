import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { memoryStorage } from "../src/adapters/storage";
import { appendTrace, auditStatus, configureRuntime, exportAuditDay } from "../src/server";

const T = "00000000-0000-4000-8000-000000000a06";
const decode = (b: Uint8Array) => new TextDecoder().decode(b).trim().split("\n").map((l) => JSON.parse(l));

describe.skipIf(!hasDb)("050 AC-6 the write-once export covers the trace and AI calls", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'T')`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await withTenant(app, T, async (tx) => {
      await appendTrace(tx, { traceId: "00000000-0000-4000-8000-0000000000f6", tenantId: T, actor: "user:maya", source: "chat" }, { kind: "turn" });
      await tx.execute(sql`insert into ai.call (tenant_id, caller, source, purpose, model, ok) values (${T}, 'user:maya', 'chat', 'chat', 'm', true)`);
    });
  });
  afterAll(() => t?.drop());

  it("AC-6 exports audit, trace and ai.call as locked objects and records the export for the screen", async () => {
    const storage = memoryStorage();
    const out = await withTenant(app, T, (tx) => exportAuditDay(tx, T, new Date(), storage, 2555));
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    expect(out.objects.map((o) => o.key)).toEqual([`audit/${T}/${day}.ndjson`, `trace/${T}/${day}.ndjson`, `ai-call/${T}/${day}.ndjson`]);
    const trace = decode(storage.objects.get(`trace/${T}/${day}.ndjson`)!.body);
    expect(trace[0]).toMatchObject({ kind: "turn", tenant_id: T });
    expect(trace.at(-1).$export).toMatchObject({ rows: 1, chain: { ok: true, length: 1 } });
    const calls = decode(storage.objects.get(`ai-call/${T}/${day}.ndjson`)!.body);
    expect(calls[0]).toMatchObject({ model: "m", tenant_id: T });
    for (const o of out.objects) expect(storage.objects.get(o.key)!.opts.retainUntil!.getTime()).toBeGreaterThan(Date.now() + 2554 * 86_400_000);
    const status = await withTenant(app, T, (tx) => auditStatus(tx, T, { fresh: true }));
    expect(status.lastExport).toMatchObject({ day: new Date().toISOString().slice(0, 10) });
    expect(status.audit).toMatchObject({ ok: true, length: 1 });
  });

  // 052 review: a put that fails part-way must not leave the day half-exported for good. The retry
  // keeps the objects already locked and writes the rest; the export row lands only when all three exist.
  it.each([["audit", 3], ["trace", 4], ["ai-call", 5]] as const)("a failed %s put is finished by the job's retry", async (failing, daysAgo) => {
    const storage = memoryStorage();
    const put = storage.put.bind(storage);
    let fail = true;
    storage.put = async (key, body, opts) => {
      if (fail && key.startsWith(`${failing}/`)) { fail = false; throw new Error("storage: put failed (503)"); }
      return put(key, body, opts);
    };
    const day = new Date(Date.now() - daysAgo * 86_400_000);
    const exports = () => withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event where action = 'core.audit.export' and resource_id = ${day.toISOString().slice(0, 10)}`));
    await expect(withTenant(app, T, (tx) => exportAuditDay(tx, T, day, storage, 30))).rejects.toThrow("503");
    expect(await exports()).toEqual([{ n: 0 }]);
    const written = new Map([...storage.objects].map(([k, v]) => [k, v.body]));
    const out = await withTenant(app, T, (tx) => exportAuditDay(tx, T, day, storage, 30));
    expect(out.objects.map((o) => [o.key.split("/")[0], !!o.existing])).toEqual(["audit", "trace", "ai-call"].map((p) => [p, written.has(out.objects.find((o) => o.key.startsWith(`${p}/`))!.key)]));
    for (const [k, body] of written) expect(storage.objects.get(k)!.body).toEqual(body);
    expect(storage.objects.size).toBe(3);
    expect(await exports()).toEqual([{ n: 1 }]);
  });
});
