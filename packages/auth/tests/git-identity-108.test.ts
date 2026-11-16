import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { gitIdentitiesOf, linkGitIdentity, setGitHubIdentities } from "../src/git-identity";

const T = "11111111-1111-4111-8111-111111111108";
const KASUN = "11111111-1111-4111-8111-1111111111a8", NIMAL = "11111111-1111-4111-8111-1111111111b8";

// 108 AC-3–AC-5: one person's GitHub login and verified emails, set as a whole, never taking over someone else's.
describe.skipIf(!hasDb)("108 GitHub identities (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  const tx = <R>(fn: Parameters<typeof withTenant<R>>[2]) => withTenant(t.app(), T, fn);
  const emailsOf = async (userId: string) => (await tx((x) => gitIdentitiesOf(x, userId))).map((g) => `${g.login} ${g.email} ${g.emailVerified}`);
  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Fictional')`;
    for (const [id, email] of [[KASUN, "kasun@lumen.test"], [NIMAL, "nimal@lumen.test"]]) await t.owner`insert into auth.user (id, tenant_id, email, name) values (${id}, ${T}, ${email}, ${email})`;
    await tx((x) => linkGitIdentity(x, T, { provider: "github", login: "nimal-s", email: "nimal@lumen.test", userId: NIMAL }));
  }, 60_000);
  afterAll(() => t?.drop());

  it.each([
    ["the first connect stores every verified email", { login: "kasun-dias", emails: ["kasun@lumen.test", "1+kasun-dias@users.noreply.github.com", "kasun@example.test"] },
      { linked: 3, removed: [], skipped: [] }, ["kasun-dias 1+kasun-dias@users.noreply.github.com true", "kasun-dias kasun@example.test true", "kasun-dias kasun@lumen.test true"]],
    ["a connect again drops what GitHub no longer lists", { login: "kasun-dias", emails: ["kasun@lumen.test", "1+kasun-dias@users.noreply.github.com"] },
      { linked: 2, removed: ["kasun@example.test"], skipped: [] }, ["kasun-dias 1+kasun-dias@users.noreply.github.com true", "kasun-dias kasun@lumen.test true"]],
    ["someone else's email is skipped and named, the rest linked", { login: "kasun-dias", emails: ["kasun@lumen.test", "nimal@lumen.test"] },
      { linked: 1, removed: ["1+kasun-dias@users.noreply.github.com"], skipped: ["nimal@lumen.test"] }, ["kasun-dias kasun@lumen.test true"]],
    ["someone else's login takes nothing over", { login: "nimal-s", emails: ["kasun@lumen.test"] },
      { linked: 0, removed: ["kasun@lumen.test"], skipped: ["@nimal-s"] }, []],
  ])("AC3 AC4 AC5 %s", async (_name, gh, result, stored) => {
    const r = await tx((x) => setGitHubIdentities(x, T, KASUN, gh));
    expect({ linked: r.linked.length, removed: r.removed, skipped: r.skipped }).toEqual(result);
    expect(await emailsOf(KASUN)).toEqual(stored);
    expect(await emailsOf(NIMAL)).toEqual(["nimal-s nimal@lumen.test true"]);
  });

  it("AC4 the schema holds several emails per login, each email one person's", async () => {
    await expect(t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email) values (${T}, ${KASUN}, 'github', 'other', 'NIMAL@lumen.test')`).rejects.toThrow(/git_identity_email/);
    const [{ n }] = await t.owner`select count(*)::int as n from auth.git_identity where provider = 'github' and login = 'nimal-s'`;
    expect(n).toBe(1);
  });
});
