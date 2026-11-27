import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import publicConfig from "../playwright.config";
import authConfig from "../playwright.auth.config";

// 154: a spec that signs in or opens the database must stay out of the public run (no database there) and run in exactly
// one signed-in project. project-tabs (144) and release-pages (147) missed both lists, and PR #134's CI failed on them.
const dir = join(__dirname, "e2e");
const signedIn = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"))
  .filter((f) => /\bsignIn\(|from "postgres"|storageState|\bowner\(\)/.test(readFileSync(join(dir, f), "utf8")));
const matches = (pattern: unknown, file: string) => [pattern].flat().some((p) => p instanceof RegExp && p.test(file));

describe("154 every signed-in e2e spec runs signed in, and only there", () => {
  it("finds the signed-in specs, the two that slipped past included", () => {
    expect(signedIn).toEqual(expect.arrayContaining(["project-tabs.spec.ts", "release-pages.spec.ts", "audit.spec.ts"]));
  });

  it.each(signedIn)("%s: ignored by the public run, matched by exactly one signed-in project", (file) => {
    expect(matches(publicConfig.testIgnore, file)).toBe(true);
    expect((authConfig.projects ?? []).filter((p) => matches(p.testMatch, file)).map((p) => p.name)).toHaveLength(1);
  });
});
