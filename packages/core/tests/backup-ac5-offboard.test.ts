import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, hasDb, repoRoot } from "@amax/db/testdb";
import { destroyDataKey, offboardingState, restoreLatest, startOffboarding, takeSnapshot } from "../src/backup";
import { as, backupDb, job, T } from "./backup-fixture";

describe.skipIf(!hasDb)("034 AC-5 a leaving tenant", () => {
  let db: Awaited<ReturnType<typeof backupDb>>;
  beforeAll(async () => (db = await backupDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC5 offers an export, waits 30 days and any legal hold, then destroys the data key so snapshots can't be read; every step audited", async () => {
    await takeSnapshot(job(), { kind: "monthly" });
    const off = await startOffboarding(as("maya"), { reason: "Contract ends (fictional)" });
    expect(db.started).toEqual([{ workflow: "core.tenant-offboarding", input: { offboardingId: off.id } }]);
    const [offered] = await db.t.owner`select status, requested_by from backup.export where id = ${off.exportId}`;
    expect(offered.status).toBe("awaiting_approval");
    expect(Math.round((Date.parse(off.destroyAfter) - Date.now()) / 86_400_000)).toBe(30);
    expect((await db.tx((tx) => offboardingState(tx, off.id))).next).toBe("wait");
    await expect(destroyDataKey(job(), { id: off.id })).rejects.toThrow();

    await db.t.owner`update backup.offboarding set destroy_after = now() - interval '1 minute'`;
    await db.t.owner`insert into privacy.legal_hold (tenant_id, kind, label, subjects, reason, placed_by) values (${T}, 'matter', 'Fictional matter', '{x}', 'test', 'user:x')`;
    expect((await db.tx((tx) => offboardingState(tx, off.id))).next).toBe("hold");
    await expect(destroyDataKey(job(), { id: off.id })).rejects.toThrow();
    await db.t.owner`update privacy.legal_hold set released_at = now()`;
    expect((await db.tx((tx) => offboardingState(tx, off.id))).next).toBe("destroy");
    await destroyDataKey(job(), { id: off.id });

    const [key] = await db.t.owner`select wrapped, destroyed_at is not null as gone from secrets.data_key where tenant_id = ${T}`;
    expect(key).toEqual({ wrapped: null, gone: true });
    const scratch = await freshDatabase();
    const drill = await restoreLatest({ live: db.app, scratchUrl: scratch.url, root: repoRoot, tenantId: T, drillId: null });
    await scratch.drop();
    expect(drill.error).toMatch(/data key was destroyed/);
    const audit = await db.t.owner`select action from core.audit_event where action like 'backup.%' order by seq`;
    expect(audit.map((a) => a.action)).toEqual(["backup.snapshot.take", "backup.offboarding.start", "backup.data_key.destroy"]);
  }, 120_000);
});
