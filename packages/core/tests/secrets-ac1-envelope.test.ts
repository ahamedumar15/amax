import { describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { putSecret, useSecret } from "../src/secrets";
import { admin, databaseText, job, secretsDb, testValue } from "./secrets-fixture";

describe.skipIf(!hasDb)("031 AC-1 envelope encryption", () => {
  const db = secretsDb();

  it("AC1 Postgres holds ciphertext and a wrapped data key only, and useSecret opens it", async () => {
    const value = testValue("xero");
    await putSecret(admin, { connector: "xero", value, expiresAt: null });
    const text = await databaseText(db.t.owner);
    for (const form of [value, Buffer.from(value).toString("base64"), Buffer.from(value).toString("hex")]) expect(text).not.toContain(form);
    const [key] = await db.t.owner`select kms, key_ref, wrapped from secrets.data_key`;
    expect(key.kms).toBe("local");
    expect(key.wrapped).toMatch(/^v1:/);
    const [v] = await db.t.owner`select ciphertext from secrets.version`;
    expect(v.ciphertext).toMatch(/^v1:/);
    expect(await useSecret(job, { connector: "xero", purpose: "pay run journal" }, async (s) => s.reveal() === value)).toBe(true);
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
  });
});
