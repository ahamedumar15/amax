import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms, putSecret, useSecret } from "../src/secrets";
import { z } from "zod";
import { contextFor, defineService, withIdempotency } from "../src/server";
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

  const OUTER: [string, (put: () => Promise<unknown>) => Promise<unknown>][] = [
    ["an outer transaction", (put) => db.app.transaction(async () => { await put(); throw new Error("outer rollback"); })],
    ["a savepoint", (put) => db.app.transaction((tx) => tx.transaction(async () => { await put(); throw new Error("savepoint rollback"); }))],
    ["another service's run", (put) => defineService({ name: "t.outer", action: "t:outer", resource: "t", input: z.object({}), run: async () => { await put(); throw new Error("service rollback"); } })(contextFor.job(T3, "t"), {})],
  ];
  const T3 = "00000000-0000-4000-8000-0000000031c3";

  it.each(OUTER)("AC1 a first write made inside %s that rolls back leaves its value readable", async (_name, wrap) => {
    const kms = localKms(new Uint8Array(randomBytes(32)));
    configureSecrets({ kms });
    await db.t.owner`insert into core.tenant (id, name) values (${T3}, 'Outer tenant') on conflict do nothing`;
    await db.t.owner`delete from secrets.version where tenant_id = ${T3}`;
    await db.t.owner`delete from secrets.credential where tenant_id = ${T3}`;
    await db.t.owner`delete from secrets.data_key where tenant_id = ${T3}`;
    const value = testValue("xero");
    await expect(wrap(() => putSecret(contextFor.ui(T3, { id: "user:maya", roles: ["Admin"] }), { connector: "xero", value, expiresAt: null }))).rejects.toThrow(/rollback/);
    configureSecrets({ kms });
    expect(await useSecret(contextFor.job(T3, "sync"), { connector: "xero", purpose: "after rollback" }, async (s) => s.reveal() === value)).toBe(true);
  });
});
