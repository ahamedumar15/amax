import { inspect } from "node:util";
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
  ["ArrayBuffer", () => new TextEncoder().encode(VALUE).buffer],
  ["a closure", (s) => () => s.reveal()],
  ["a Promise", (s) => ({ later: Promise.resolve(s.reveal()) })],
  ["an Error's cause", () => ({ err: new Error("x", { cause: VALUE }) })],
  ["a non-enumerable property", () => Object.defineProperty({}, "hidden", { value: VALUE, enumerable: false })],
  ["base64 of a JSON body", () => Buffer.from(JSON.stringify({ secret: VALUE })).toString("base64")],
  ["a symbol", () => ({ tag: Symbol(VALUE) })],
  ["an AggregateError", () => ({ err: new AggregateError([new Error(VALUE)], "many") })],
  ["an Error subclass with a getter", () => ({ err: new (class HttpError extends Error { get body() { return VALUE; } })("401") })],
  ["UTF-16 bytes", () => Buffer.from(VALUE, "utf16le")],
  ["percent-encoded base64", () => `grant=client&auth=${encodeURIComponent(Buffer.from(`id:${VALUE}`).toString("base64"))}`],
  ["a Proxy", () => new Proxy({}, { ownKeys: () => ["a"], getOwnPropertyDescriptor: () => ({ value: "x", enumerable: true, configurable: true }), get: () => VALUE })],
  ["base64 behind a parameter name", () => `client_assertion=${Buffer.from(`id:${VALUE}`).toString("base64")}&x=1`],
  ["a misaligned base64 run", () => `/v1/${Buffer.from(`id:${VALUE}`).toString("base64")}`.replace("/v1/", "/v1/a")],
];

describe.skipIf(!hasDb)("031 AC-2 every encoding of a value stays inside useSecret", () => {
  secretsDb();

  it.each(VARIANTS)("AC2 %s: never reaches the caller, and is scrubbed from errors", async (_name, leak) => {
    await putSecret(admin, { connector: "xero", value: VALUE, expiresAt: null });
    const out = await useSecret(job, { connector: "xero", purpose: "variant" }, async (s) => leak(s)).catch((e: unknown) => e);
    if (!(out instanceof SecretLeakError)) {
      const text = `${JSON.stringify(out)} ${inspect(out, { depth: 20, showHidden: true, getters: true })}`;
      for (const form of [VALUE, b.toString("base64"), b.toString("base64url"), b.toString("hex"), encodeURIComponent(VALUE)]) expect(text).not.toContain(form);
      expect(JSON.stringify(out)?.match(/\d+/g) ?? []).not.toEqual(expect.arrayContaining([...b].map(String)));
    }
    const e = (await useSecret(job, { connector: "xero", purpose: "variant" }, async (s) => {
      const shown = leak(s);
      const text = typeof shown === "string" ? shown : String(JSON.stringify(shown instanceof Map ? [...shown] : shown instanceof Set ? [...shown] : shown, (_k, v) => (typeof v === "symbol" ? v.description : v)));
      throw Object.assign(new Error(`failed: ${text}`), { name: `E ${text}` });
    }).catch((x: Error) => x)) as Error;
    const thrown = `${e.name} ${e.message} ${e.stack}`;
    for (const form of [VALUE, b.toString("base64"), b.toString("base64url"), b.toString("hex"), encodeURIComponent(VALUE)]) expect(thrown).not.toContain(form);
  });
});
