import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { pruneBackups, takeSnapshot } from "../src/backup";
import { backupDb, job, T } from "./backup-fixture";

describe.skipIf(!hasDb)("034 AC-2 encrypted snapshots in the tenant's region, kept by 032", () => {
  let db: Awaited<ReturnType<typeof backupDb>>;
  beforeAll(async () => (db = await backupDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC2 seals every table with the data key, writes only in the data region, and pauses pruning under a legal hold", async () => {
    const snap = await takeSnapshot(job(), { kind: "daily" });
    expect(snap).toMatchObject({ region: "AU", kind: "daily" });
    expect(db.regions.LK.objects.size).toBe(0);
    const objects = [...db.regions.AU.objects.entries()];
    expect(objects.some(([k]) => k.endsWith("/auth.user.json.sealed"))).toBe(true);
    const text = objects.map(([, o]) => new TextDecoder().decode(o.body)).join("\n");
    expect(text).not.toMatch(/Maya Test|maya@example\.test/);
    expect(text.split("\n").every((l) => l.startsWith("v1:"))).toBe(true);
    const [row] = await db.t.owner`select tables, row_count, extract(day from expires_at - taken_at)::int as keep from backup.snapshot where id = ${snap.id}`;
    expect([row.tables["auth.user"], row.keep]).toEqual([3, 14]);

    await db.t.owner`update ai.settings set data_region = 'SG' where tenant_id = ${T}`;
    await expect(takeSnapshot(job(), { kind: "daily" })).rejects.toThrow(/no backup storage is configured in the tenant's data region \(SG\)/);
    await db.t.owner`update ai.settings set data_region = 'AU' where tenant_id = ${T}`;

    await db.t.owner`update backup.snapshot set expires_at = now() - interval '1 day'`;
    await db.t.owner`insert into privacy.legal_hold (tenant_id, kind, label, subjects, reason, placed_by) values (${T}, 'matter', 'Fictional matter', '{x}', 'test', 'user:x')`;
    expect(await pruneBackups(job(), {})).toMatchObject({ paused: true });
    expect(db.regions.AU.objects.size).toBe(objects.length);
    await db.t.owner`update privacy.legal_hold set released_at = now()`;
    expect(await pruneBackups(job(), {})).toMatchObject({ paused: false, snapshots: 1 });
    expect(db.regions.AU.objects.size).toBe(0);
  }, 60_000);
});
