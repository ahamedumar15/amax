import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { loadEnv } from "../src/env";
import { CONNECTOR_IDS, SecretNotConfiguredError, useSecret } from "../src/secrets";
import { job, secretsDb } from "./secrets-fixture";

const envNames = (c: string) => [c, `${c}_TOKEN`, `${c}_SECRET`, `AMAX_${c}`, `AMAX_SECRET_${c}`].map((n) => n.toUpperCase().replaceAll("-", "_"));
const src = join(import.meta.dirname, "../src/secrets");

describe.skipIf(!hasDb)("031 AC-5 deployment settings come from the environment, tenant credentials never do", () => {
  secretsDb();

  it("AC5 KMS settings are validated at boot, and a credential set only in the environment is never used", async () => {
    expect(() => loadEnv({ AMAX_KMS: "aws" })).toThrow(/AMAX_KMS_AWS_KEY_ID[\s\S]*AWS_SECRET_ACCESS_KEY/);
    expect(() => loadEnv({ AMAX_KMS: "local" })).toThrow(/AMAX_KMS_KEY_FILE: required when AMAX_KMS=local/);
    expect(() => loadEnv({ ANTHROPIC_API_KEY: "short" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(loadEnv({ ANTHROPIC_API_KEY: "test-key-test-key-test-key" }).ANTHROPIC_API_KEY).toBe("set");
    const names = CONNECTOR_IDS.flatMap(envNames);
    for (const n of names) process.env[n] = `test-env-${n}`;
    try {
      for (const connector of CONNECTOR_IDS) {
        await expect(useSecret(job, { connector, purpose: "env probe" }, async () => "used")).rejects.toThrow(SecretNotConfiguredError);
      }
    } finally {
      for (const n of names) delete process.env[n];
    }
    for (const f of readdirSync(src)) expect(readFileSync(join(src, f), "utf8"), f).not.toMatch(/process\.env|import\.meta\.env/);
  });
});
