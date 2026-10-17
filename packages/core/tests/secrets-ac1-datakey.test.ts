import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms, putSecret, useSecret } from "../src/secrets";
import { contextFor, ForbiddenError, setAuthorizer } from "../src/server";
import { secretsDb, testValue } from "./secrets-fixture";

const T2 = "00000000-0000-4000-8000-0000000031b2";
const admin = contextFor.ui(T2, { id: "user:maya", roles: ["Admin"] });
const job = contextFor.job(T2, "xero-sync");

describe.skipIf(!hasDb)("031 AC-1 data keys and use permission", () => {
  const db = secretsDb();

  it("AC1 a data key is cached only once its row has committed", async () => {
    const kms = localKms(new Uint8Array(randomBytes(32)));
    configureSecrets({ kms });
    await db.t.owner`insert into core.tenant (id, name) values (${T2}, 'Second tenant')`;
    await db.t.owner.unsafe(`create function secrets.fail_github() returns trigger language plpgsql as $$
      begin if (select connector from secrets.credential where id = new.credential_id) = 'github' then raise exception 'test failure'; end if; return new; end $$;
      create trigger fail_github before insert on secrets.version for each row execute function secrets.fail_github()`);
    await expect(putSecret(admin, { connector: "github", value: testValue("gh"), expiresAt: null })).rejects.toThrow();
    const value = testValue("xero");
    await putSecret(admin, { connector: "xero", value, expiresAt: null });
    configureSecrets({ kms });
    expect(await useSecret(job, { connector: "xero", purpose: "after restart" }, async (s) => s.reveal() === value)).toBe(true);
  });

  it("AC1 using a credential needs secrets:credential:use", async () => {
    setAuthorizer((ctx, action) => ctx.actor.kind === "system" || (action === "secrets:credential:use" && !!ctx.actor.roles?.includes("Admin")));
    const engineer = contextFor.ui(T2, { id: "user:nimal", roles: ["Engineer"] });
    await expect(useSecret(engineer, { connector: "xero", purpose: "probe" }, async () => true)).rejects.toThrow(ForbiddenError);
    expect(await useSecret(job, { connector: "xero", purpose: "sync" }, async () => true)).toBe(true);
    setAuthorizer(() => true);
  });
});
