import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms, putSecret, useSecret } from "../src/secrets";
import { contextFor, withIdempotency } from "../src/server";
import { secretsDb, testValue } from "./secrets-fixture";

const FAILURE_POINTS: [string, string][] = [
  ["the version insert", "insert on secrets.version"],
  ["the audit write", "insert on core.audit_event"],
  ["the event emit", "insert on core.event"],
  ["the idempotency settle", "update on core.idempotency"],
];

describe.skipIf(!hasDb)("031 AC-1 a tenant's data key is committed before any value is sealed with it", () => {
  const db = secretsDb();

  it.each(FAILURE_POINTS)("AC1 a first write that fails at %s leaves later values readable", async (_name, point) => {
    const tenant = `00000000-0000-4000-8000-${randomBytes(6).toString("hex")}`;
    const [op, table] = point.split(" on ");
    const kms = localKms(new Uint8Array(randomBytes(32)));
    configureSecrets({ kms });
    await db.t.owner`insert into core.tenant (id, name) values (${tenant}, 'Failure tenant')`;
    await db.t.owner.unsafe(`create or replace function public.fail_once() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
      create trigger fail_once before ${op} on ${table} for each row when (new.tenant_id = '${tenant}') execute function public.fail_once()`);
    const admin = contextFor.ui(tenant, { id: "user:maya", roles: ["Admin"] });
    try {
      await expect(withIdempotency(`k-${tenant}`, () => putSecret(admin, { connector: "github", value: testValue("gh"), expiresAt: null })).then((r) => (r.ok ? r : Promise.reject(r.error)))).rejects.toSatisfy((e: Error) => /test failure/.test(`${e.message} ${(e.cause as Error | undefined)?.message}`));
    } finally {
      await db.t.owner.unsafe(`drop trigger fail_once on ${table}`);
    }
    const value = testValue("xero");
    await putSecret(admin, { connector: "xero", value, expiresAt: null });
    configureSecrets({ kms });
    expect(await useSecret(contextFor.job(tenant, "sync"), { connector: "xero", purpose: "after restart" }, async (s) => s.reveal() === value)).toBe(true);
  });
});
