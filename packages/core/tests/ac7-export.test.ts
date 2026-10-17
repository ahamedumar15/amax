import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { memoryStorage, ObjectLockedError } from "../src/adapters/storage";
import { exportAuditDay } from "../src/audit-export";
import { appendAudit } from "../src/audit";
import { contextFor } from "../src/authorize";
import { configureRuntime } from "../src/service";

const T = "00000000-0000-4000-8000-0000000000e7";
const U = "00000000-0000-4000-8000-0000000000e8";

describe.skipIf(!hasDb)("AC-7 daily export to write-once storage", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'T'), (${U}, 'U')`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    for (const tenant of [T, U]) {
      for (let i = 0; i < 3; i++) await withTenant(app, tenant, (tx) => appendAudit(tx, contextFor.ui(tenant, { id: "user:maya" }), { action: "x", resource: "x", resourceId: String(i) }));
    }
  });
  afterAll(() => t?.drop());

  it("exports one tenant's day as NDJSON with a verified chain trailer, locked for the retention period", async () => {
    const storage = memoryStorage();
    const today = new Date();
    const out = await withTenant(app, T, (tx) => exportAuditDay(tx, T, today, storage, 2555));
    expect(out).toMatchObject({ rows: 3, chainOk: true });
    expect(out.key).toBe(`audit/${T}/${today.toISOString().slice(0, 10).replaceAll("-", "/")}.ndjson`);
    const obj = storage.objects.get(out.key)!;
    const lines = new TextDecoder().decode(obj.body).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).every((l) => l.tenant_id === T)).toBe(true);
    expect(lines[3].$export).toMatchObject({ tenantId: T, rows: 3, chain: { ok: true, length: 3 } });
    const days = (obj.opts.retainUntil!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2554);
    expect(obj.opts.contentType).toBe("application/x-ndjson");
  });

  it("can't overwrite an exported day", async () => {
    const storage = memoryStorage();
    await withTenant(app, U, (tx) => exportAuditDay(tx, U, new Date(), storage, 30));
    await expect(withTenant(app, U, (tx) => exportAuditDay(tx, U, new Date(), storage, 30))).rejects.toBeInstanceOf(ObjectLockedError);
  });
});
