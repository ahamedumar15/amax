import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "@amax/core/env";

const repo = join(__dirname, "../../..");
const standard = (root: string) => spawnSync("node", [join(repo, "scripts/check-module-standard.mjs"), "--root", root], { encoding: "utf8" });

describe("AC7 configuration and ownership", () => {
  it("AC7 bad environment fails with a clear message and the module standard is enforced", () => {
    expect(loadEnv({ AMAX_BASE_URL: "https://amax.example.dev" }).NODE_ENV).toBe("development");
    expect(() => loadEnv({ AMAX_BASE_URL: "not-a-url", PORT: "abc" })).toThrow(/AMAX_BASE_URL[\s\S]*PORT[\s\S]*Fix these variables/);
    expect(standard(repo).status).toBe(0);
    const broken = standard(join(__dirname, "../standard/missing"));
    expect(broken.status).toBe(2);
    expect(broken.stderr).toMatch(/missing README\.md[\s\S]*no CODEOWNERS line/);
  });

  it("032 AC-1 a module whose personal-data table has no retention entry fails the standard; pseudonymous ids alone don't count", () => {
    const r = standard(join(__dirname, "../standard/no-retention"));
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n").filter((l) => l.includes("retention"))).toEqual(["  - modules/people: personal-data table people.visit has no retention entry (032)"]);
  });
});
