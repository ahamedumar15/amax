import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms } from "@amax/core/secrets";
import type { Viewer } from "@amax/auth";
import { adminDb } from "./fixture";

const STEER = /Use set_github_app/;

// 116 AC-2, AC-6: the generic credential tools send the GitHub app to set_github_app, refuse a value without
// "<client id>:<client secret>", and say when no key service is set instead of "I can't tell whether this was done".
describe.skipIf(!hasDb)("116 the github-oauth guard (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await adminDb(); maya = await db.as("maya"); });
  afterAll(() => db?.t.drop());
  const call = (tool: string, input: Record<string, unknown>, secret: string) => db.registry.call(maya, tool, input, { source: "mcp", secret });
  const propose = (tool: string, connector: string) => db.registry.toolsFor(maya).find((t) => t.name === tool)!.propose!(maya as never, { connector } as never);

  it.each([["put_secret"], ["rotate_secret"]])("AC2 chat is steered from %s to set_github_app for the GitHub app only", async (tool) => {
    await expect(propose(tool, "github-oauth")).rejects.toThrow(STEER);
    await expect(propose(tool, "xero")).resolves.toBeUndefined();
  });

  it.each([
    ["only the secret", "f".repeat(40)],
    ["the id with nothing after its colon", "Ov23liFAKEdemo01:"],
    ["nothing before the colon", `:${"f".repeat(40)}`],
    ["two colons", `Ov23li:FAKE:${"f".repeat(40)}`],
  ])("AC2 put_secret refuses a github-oauth value of %s", async (_n, value) => {
    await expect(call("put_secret", { connector: "github-oauth" }, value)).rejects.toThrow(STEER);
  });

  it("AC2 a well-formed value is stored, and rotate_secret checks the same", async () => {
    await call("put_secret", { connector: "github-oauth" }, `Ov23liFAKEdemo01:${"f".repeat(40)}`);
    await expect(call("rotate_secret", { connector: "github-oauth" }, "f".repeat(40))).rejects.toThrow(STEER);
  });

  it("AC6 with no key service, adding a credential says an operator sets AMAX_KMS", async () => {
    configureSecrets({ kms: null });
    try { await expect(call("put_secret", { connector: "xero" }, "x".repeat(30))).rejects.toThrow(/no key service is set \(AMAX_KMS\)/); }
    finally { configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) }); }
  });
});
