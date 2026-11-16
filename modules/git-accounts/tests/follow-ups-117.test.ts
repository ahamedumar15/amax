import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, putSecret, revokeSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect, RESULTS } from "../contracts";
import { chatSuggestions } from "../chat-suggestions";
import { parseGitHubApp } from "../server/app";
import { resultCodeOf } from "../server/connect";
import { ctxFor } from "../server/context";
import { gitAccountsDatabase, T } from "./setup";

// 117 AC-3: the one rule for a usable "<client id>:<client secret>".
describe("117 AC-3 a usable GitHub app value", () => {
  it.each([
    ["an id and a 40-character secret", `Ov23liFAKEdemo01:${"a".repeat(40)}`, true],
    ["only the secret", "a".repeat(40), false],
    ["a short secret", "Ov23liFAKEdemo01:short", false],
    ["the placeholder", "<Client ID>:<Client secret>", false],
    ["a second colon", `Ov23li:FAKE:${"a".repeat(40)}`, false],
    ["nothing after the colon", "Ov23liFAKEdemo01:", false],
  ])("%s", (_n, value, ok) => {
    expect(parseGitHubApp(value) !== null).toBe(ok);
  });
});

// 117 AC-2, AC-3: a wrong secret is said plainly; an incomplete value isn't "configured" for an Admin.
describe.skipIf(!hasDb)("117 the GitHub app's follow-ups (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, maya: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, maya] = [await db.as("kasun"), await db.as("maya")]; }, 120_000);
  afterAll(() => db?.drop());
  const job = contextFor.job(T, "test");
  const status = () => db.registry.call(maya, "get_github_app_status", {}, { source: "mcp" }) as Promise<{ configured: boolean; incomplete: boolean }>;
  const offered = async () => (await Promise.all(chatSuggestions.filter((s) => s.routes.includes("/settings/integrations"))
    .map(async (s) => ((await s.when!(maya as never, {})) ? s.label : null)))).filter(Boolean);

  const app = async (value: string) => {
    await revokeSecret(job, { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await db.t.owner`delete from secrets.version where credential_id in (select id from secrets.credential where connector = 'github-oauth')`;
    await db.t.owner`delete from secrets.credential where connector = 'github-oauth'`;
    await putSecret(job, { connector: "github-oauth", value });
  };
  it.each([
    ["a wrong Client secret", `app-id:${"w".repeat(40)}`, "good", "credentials"],
    ["a wrong Client ID", "Ov23liWRONG0000:app-secret-fake-0000000000", "good", "credentials"],
    ["a Redirect URI GitHub refuses", "app-id:app-secret-fake-0000000000", "mismatch", "callback"],
    ["a code GitHub doesn't know (still 'Try again')", "app-id:app-secret-fake-0000000000", "unknown-code", "github"],
  ])("AC2 GitHub's exchange reply for %s comes back as its own result", async (_n, value, code, result) => {
    await app(value);
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    const e = await completeGitHubConnect(ctxFor(kasun), { state: new URL(r.open.url).searchParams.get("state")!, code }).catch((x: unknown) => x);
    expect(resultCodeOf(e)).toBe(result);
    if (result === "credentials") expect([RESULTS.credentials.includes("An Admin replaces the GitHub app"), /try again/i.test(RESULTS.credentials)]).toEqual([true, false]);
  });

  it("AC3 an incomplete stored value is Incomplete, offers Set up, and is configured again once set up", async () => {
    await app("only-the-secret-00000000000000");
    expect([await status(), await offered()]).toEqual([expect.objectContaining({ configured: false, incomplete: true }), ["Set up the GitHub app"]]);
    await db.registry.call(maya, "set_github_app", { clientId: "Ov23liFAKEdemo01" }, { source: "mcp", secret: "c".repeat(40) });
    expect([await status(), await offered()]).toEqual([expect.objectContaining({ configured: true, incomplete: false }), ["Rotate the GitHub app secret", "Remove the GitHub app"]]);
  });

  it("review round 1: a key service outage is 'couldn't check', never Incomplete (kept last: the key can't come back)", async () => {
    await app("only-the-secret-00000000000000");
    configureSecrets({ kms: null });
    expect(await status()).toEqual(expect.objectContaining({ incomplete: false }));
  });
});
