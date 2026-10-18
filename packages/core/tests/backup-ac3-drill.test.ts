import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, hasDb, repoRoot } from "@amax/db/testdb";
import { drillStatus, recordDrill, requestDrill, restoreLatest, takeSnapshot } from "../src/backup";
import { as, backupDb, job, T } from "./backup-fixture";

describe.skipIf(!hasDb)("034 AC-3 the restore drill", () => {
  let db: Awaited<ReturnType<typeof backupDb>>;
  let scratch: Awaited<ReturnType<typeof freshDatabase>>;
  beforeAll(async () => {
    db = await backupDb();
    scratch = await freshDatabase();
  }, 60_000);
  afterAll(async () => {
    await scratch?.drop();
    await db?.t.drop();
  });

  it("AC3 restores the latest snapshot into a scratch database, checks row counts and the audit chain, records the result and leaves nothing behind", async () => {
    await takeSnapshot(job(), { kind: "daily" });
    await takeSnapshot(job(), { kind: "monthly" });
    const asked = await requestDrill(as("maya"), {});
    const out = await restoreLatest({ live: db.app, scratchUrl: scratch.url, root: repoRoot, tenantId: T, drillId: asked.id });
    expect(out).toMatchObject({ error: null, mismatches: [], chainOk: true });
    expect(out.chainLength).toBe(2);
    expect(out.rowsChecked).toBeGreaterThan(5);
    expect(await recordDrill(job(), out)).toMatchObject({ id: asked.id, status: "passed" });
    const [left] = await scratch.owner`select count(*)::int as n from pg_namespace where nspname in ('core', 'auth', 'backup')`;
    expect(left.n).toBe(0);
    const [row] = await db.t.owner`select status, rows_checked, chain_ok, finished_at is not null as done from backup.drill where id = ${asked.id}`;
    expect(row).toMatchObject({ status: "passed", chain_ok: true, done: true });

    await db.t.owner`update backup.snapshot set tables = jsonb_set(tables, '{auth.user}', '9')`;
    const bad = await restoreLatest({ live: db.app, scratchUrl: scratch.url, root: repoRoot, tenantId: T, drillId: null });
    expect(bad.mismatches).toEqual([{ table: "auth.user", expected: 9, restored: 3 }]);
    expect(drillStatus(bad).status).toBe("failed");
    expect(drillStatus({ ...out, durationMs: 72 * 60_000 })).toEqual({ status: "slow", note: "slower than an hour" });
  }, 120_000);
});
