import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { checkAuditChain } from "../server/chain";
import { complianceDb, T } from "./db";

describe.skipIf(!hasDb)("AC4 the daily audit-chain check (Postgres)", () => {
  let db: Awaited<ReturnType<typeof complianceDb>>;
  beforeAll(async () => {
    db = await complianceDb();
  }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC4 a daily job records the last verified point; changing one audit row fails verification, naming the row", async () => {
    expect((manifest.schedules as { name: string; cron: string }[]).find((s) => s.name === "compliance.audit-chain")).toMatchObject({ cron: "0 6 * * *" });
    const job = () => checkAuditChain(contextFor.job(T, "compliance.audit-chain"), {});
    const first = await job();
    expect(first).toMatchObject({ ok: true, source: "job" });
    const [target] = await db.q(sql`select seq, action, resource from core.audit_event where tenant_id = ${T} order by seq desc limit 1`);
    await db.t.owner.begin(async (tx) => {
      await tx`alter table core.audit_event disable trigger audit_append_only`;
      await tx`update core.audit_event set action = 'compliance.tampered' where tenant_id = ${T} and seq = ${Number(target.seq)}`;
      await tx`alter table core.audit_event enable trigger audit_append_only`;
    });
    const broken = await job();
    expect(broken).toMatchObject({ ok: false, brokenAt: Number(target.seq), brokenAction: "compliance.tampered", brokenResource: target.resource, reason: "hash mismatch" });
    expect(broken.summary).toBe(`Broken at event ${Number(target.seq).toLocaleString("en-US")} (compliance.tampered on ${target.resource}): hash mismatch`);
    expect((await db.q(sql`select ok from compliance.chain_check order by checked_at desc limit 1`))[0].ok).toBe(false);
  }, 60_000);
});
