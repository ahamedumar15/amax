import { describe, expect, it } from "vitest";
import { NO_KEY_SERVICE, SecretsUnavailableError } from "@amax/core/secrets";
import { ForbiddenError } from "@amax/core/server";
import { problemOf } from "../server/app";
import { APP_INCOMPLETE } from "../words";

const named = (name: string, message = "x") => Object.assign(new Error(message), { name });

// 117 review rounds 3 and 4 (escalated): why the GitHub app couldn't be checked, by every branch: a refused use (it
// lasts), the vault's own reasons, an incomplete value, and anything else as a passing failure.
describe("117 why the GitHub app wasn't checked", () => {
  it.each([
    ["a refused use (ForbiddenError)", new ForbiddenError("secrets:use:github-oauth", "secrets.credential"), /may see the GitHub app but not use its credential/],
    ["a refused use, rebuilt by the secret's scrub", named("ForbiddenError"), /may see the GitHub app but not use its credential/],
    ["the vault's own reason", new SecretsUnavailableError("this tenant has no data key yet"), /no data key yet|no key service is set/],
    ["a value that doesn't parse", named("GitHubAppIncomplete"), new RegExp(APP_INCOMPLETE.slice(0, 30))],
    ["anything else", named("KmsError", "wrapped by a different local key file"), /^amax couldn't read the GitHub app's credential just now$/],
  ])("%s", (_n, e, words) => {
    const said = problemOf(e);
    expect([words.test(said), said === NO_KEY_SERVICE && !/key service/.test(String(words))]).toEqual([true, false]);
  });
});
