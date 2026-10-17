import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { EXPIRING_EVENT, putSecret, revokeSecret, SecretNotConfiguredError, secretsSweepJob, useSecret, useValidSecrets } from "../src/secrets";
import { admin, job, secretsDb, T, testValue } from "./secrets-fixture";

const DAY = 86_400_000;
const h = (v: string) => createHash("sha256").update(v).digest("hex");

describe.skipIf(!hasDb)("031 AC-3 audited use, rotation with grace, expiry warnings", () => {
  const db = secretsDb();
  const sweep = () => withTenant(db.app, T, (tx) => secretsSweepJob.run({ tx, tenantId: T, payload: {}, jobId: "test" }));
  const reveal = (purpose: string) => useSecret(job, { connector: "azure-devops", purpose }, async (s) => h(s.reveal()));

  it("AC3 uses are audited without the value; rotation keeps the old value valid for the grace period, then revokes it", async () => {
    const [v1, v2] = [testValue("ado-1"), testValue("ado-2")];
    await putSecret(admin, { connector: "azure-devops", value: v1, expiresAt: new Date(Date.now() + 5 * DAY).toISOString() });
    expect(await reveal("webhook")).toBe(h(v1));
    const [use] = await db.t.owner`select actor, source, after from core.audit_event where action = 'secrets.credential.use'`;
    expect(use).toMatchObject({ actor: "job:graph-sync", source: "job", after: { connector: "azure-devops", purpose: "webhook", versions: [1] } });

    await sweep();
    await sweep();
    const warned = await db.t.owner`select payload from core.event where name = ${EXPIRING_EVENT}`;
    expect(warned.map((e) => e.payload.withinDays)).toEqual([7]);

    await putSecret(admin, { connector: "azure-devops", value: v2, expiresAt: new Date(Date.now() + 180 * DAY).toISOString(), graceHours: 24 });
    expect(await reveal("sync")).toBe(h(v2));
    expect(await useValidSecrets(job, { connector: "azure-devops", purpose: "verify webhook" }, async (all) => all.map((s) => h(s.reveal())))).toEqual([h(v2), h(v1)]);
    await db.t.owner`update secrets.version set valid_until = now() - interval '1 second' where version = 1`;
    await sweep();
    const [old] = await db.t.owner`select revoked_at, ciphertext from secrets.version where version = 1`;
    expect(old.revoked_at).not.toBeNull();
    expect(old.ciphertext).toBeNull();
    expect(await useValidSecrets(job, { connector: "azure-devops", purpose: "verify webhook" }, async (all) => all.length)).toBe(1);

    await revokeSecret(admin, { connector: "azure-devops", reason: "replaced" });
    await expect(reveal("after revoke")).rejects.toThrow(SecretNotConfiguredError);
    const audit = await db.t.owner`select action, after::text as after from core.audit_event order by seq`;
    expect(audit.map((a) => a.action)).toContain("secrets.credential.revoke");
    expect(audit.map((a) => a.after).join()).not.toMatch(new RegExp(`${v1}|${v2}`));
    expect(await withTenant(db.app, T, (tx) => tx.execute(sql`select count(*)::int as n from secrets.version where ciphertext is not null`))).toEqual([{ n: 0 }]);
  });
});
