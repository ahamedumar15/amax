import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Check = (base: string[], head: string[]) => { failures: string[]; known: string[] };

describe("089 change numbers", () => {
  it("AC-10 fails a PR's new folder that reuses a base or PR number; base pairs and archived moves pass", async () => {
    const { check } = (await import(pathToFileURL(join(__dirname, "../../../scripts/check-change-numbers.mjs")).href)) as { check: Check };
    const base = ["073-time", "074-dev-demo-data", "074-fork-pr-review-gate", "088-quiet-hours"];
    expect(check(base, [...base, "089-sync"])).toEqual({ failures: [], known: ["074: 074-dev-demo-data, 074-fork-pr-review-gate (already on the base branch)"] });
    expect(check(base, [...base, "088-agent-draft"]).failures).toEqual([expect.stringMatching(/^088-agent-draft: number 088 is already used by 088-quiet-hours/)]);
    expect(check(base, [...base, "090-a", "090-b"]).failures).toHaveLength(2);
    expect(check(base, ["073-time", "074-dev-demo-data", "074-fork-pr-review-gate", "088-quiet-hours"]).failures).toEqual([]);
  });
});
