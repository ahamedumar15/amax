import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { approveExport, buildExport, exportLink, linkValid, readExport, recordDownload, requestExport, untar } from "../src/backup";
import { as, backupDb, job, T } from "./backup-fixture";

describe.skipIf(!hasDb)("034 AC-4 tenant export behind a second Admin", () => {
  let db: Awaited<ReturnType<typeof backupDb>>;
  beforeAll(async () => (db = await backupDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC4 one Admin asks, a different Admin approves, the build writes JSON per module plus files, and the signed link lasts 24 hours", async () => {
    await db.files.put(`audit/${T}/2026/10/17.ndjson`, "{\"seq\":1}\n");
    await db.t.owner`insert into core.audit_event (tenant_id, seq, occurred_at, chain_v, actor, source, action, resource, resource_id, prev_hash, hash)
      values (${T}, 1000, now(), 2, 'job:core.audit.export', 'job', 'core.audit.export', 'core.audit_event', '2026-10-17', 'x', 'y')`;
    await expect(requestExport(as("ravi", ["ITAdmin"]), { reason: "Yearly archive" })).rejects.toThrow(/forbidden: backup:manage/);
    const asked = await requestExport(as("maya"), { reason: "Yearly archive" });
    await expect(approveExport(as("maya"), { id: asked.id })).rejects.toThrow(/a second Admin must approve/);
    await approveExport(as("sahan"), { id: asked.id });
    expect(db.started).toEqual([{ workflow: "core.tenant-export", input: { exportId: asked.id } }]);
    await buildExport(job(), { id: asked.id });

    const [row] = await db.t.owner`select status, storage_key, extract(epoch from expires_at - ready_at)::int as secs, approved_by from backup.export where id = ${asked.id}`;
    expect(row).toMatchObject({ status: "ready", secs: 86_400, approved_by: `user:00000000-0000-4000-8000-000000003412` });
    expect(new TextDecoder().decode(db.regions.AU.objects.get(row.storage_key)!.body)).toMatch(/^v1:/);
    const archive = untar(await db.tx((tx) => readExport(tx, T, asked.id, row.storage_key)));
    const names = archive.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["manifest.json", "modules/auth.json", "modules/core.json", `files/audit/${T}/2026/10/17.ndjson`]));
    expect(names.some((n) => n.startsWith("modules/secrets"))).toBe(false);
    const auth = JSON.parse(new TextDecoder().decode(archive.find((e) => e.name === "modules/auth.json")!.body));
    expect(auth.user).toHaveLength(3);
    expect(JSON.stringify(auth)).not.toContain("hash-never-exported");
    expect(JSON.parse(new TextDecoder().decode(archive[0].body)).privacy).toMatchObject({ erasedPeople: 0, legalHoldsActive: 0 });

    const url = new URL(exportLink(T, asked.id, new Date(Date.now() + 86_400_000)), "http://x");
    const [exp, sig] = [Number(url.searchParams.get("exp")), url.searchParams.get("sig")!];
    expect([linkValid(T, asked.id, exp, sig), linkValid(T, asked.id, exp, sig, (exp + 1) * 1000), linkValid(T, asked.id, exp + 60, sig)]).toEqual([true, false, false]);
    expect(await recordDownload(as("sahan"), { id: asked.id })).toEqual({ storageKey: row.storage_key });
    await db.t.owner`update backup.export set expires_at = now() - interval '1 minute' where id = ${asked.id}`;
    await expect(recordDownload(as("sahan"), { id: asked.id })).rejects.toThrow(/expired/);
  }, 60_000);
});
