import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { putSecret, SecretLeakError, useSecret, type Secret } from "../src/secrets";
import { admin, job, secretsDb } from "./secrets-fixture";

const VALUE = `test-q"uo\\te+/= ${"x".repeat(12)}`;
const b = Buffer.from(VALUE);
class Holder {
  constructor(readonly inner: string) {}
}

const VARIANTS: [string, (s: Secret) => unknown][] = [
  ["raw", (s) => s.reveal()],
  ["base64", () => b.toString("base64")],
  ["base64url", () => b.toString("base64url")],
  ["hex", () => b.toString("hex")],
  ["uri", () => encodeURIComponent(VALUE)],
  ["form", () => new URLSearchParams({ client_secret: VALUE }).toString()],
  ["json-escaped", () => JSON.stringify({ body: JSON.stringify({ v: VALUE }) })],
  ["basic auth", () => ({ authorization: `Basic ${Buffer.from(`client-id:${VALUE}`).toString("base64")}` })],
  ["the Secret itself", (s) => ({ keep: s })],
  ["Map", () => new Map([["token", VALUE]])],
  ["Set", () => new Set([VALUE])],
  ["class instance", () => new Holder(VALUE)],
  ["bytes", () => new TextEncoder().encode(VALUE)],
];

describe.skipIf(!hasDb)("031 AC-2 every encoding of a value stays inside useSecret", () => {
  secretsDb();

  it.each(VARIANTS)("AC2 %s: refused as a result and scrubbed from errors", async (_name, leak) => {
    await putSecret(admin, { connector: "xero", value: VALUE, expiresAt: null });
    await expect(useSecret(job, { connector: "xero", purpose: "variant" }, async (s) => leak(s))).rejects.toThrow(SecretLeakError);
    const e = (await useSecret(job, { connector: "xero", purpose: "variant" }, async (s) => {
      const shown = leak(s);
      const text = typeof shown === "string" ? shown : JSON.stringify(shown instanceof Map ? [...shown] : shown instanceof Set ? [...shown] : shown);
      throw Object.assign(new Error(`failed: ${text}`), { name: `E ${text}` });
    }).catch((x: Error) => x)) as Error;
    const thrown = `${e.name} ${e.message} ${e.stack}`;
    for (const form of [VALUE, b.toString("base64"), b.toString("base64url"), b.toString("hex"), encodeURIComponent(VALUE)]) expect(thrown).not.toContain(form);
  });
});
