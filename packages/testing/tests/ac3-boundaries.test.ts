import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "../../..");
const check = (fixture: string) => spawnSync("node", [join(repo, "scripts/check-graph.mjs"), "--root", join(__dirname, "../boundaries", fixture)], { encoding: "utf8" });

const forbidden: [string, string][] = [
  ["r1-internals", "R1"],
  ["r2-relative", "R2"],
  ["r3-package-imports-module", "R3"],
  ["r4-undeclared", "R4"],
  ["r5-cycle", "R5"],
  ["r6-proposal-cycle", "R6"],
  ["r7-provider-sdk", "R7"],
  ["r8-trace-or-fail", "R8"],
];

describe("AC3 import boundaries", () => {
  it("AC3 each forbidden pattern fails the graph check and a clean repo passes", () => {
    expect(check("clean").status).toBe(0);
    for (const [fixture, rule] of forbidden) {
      const run = check(fixture);
      expect(run.status, fixture).toBe(2);
      expect(run.stderr, fixture).toContain(rule);
    }
  });

  it("AC-2 (053) only packages/chat/src/engine.ts may use the fail-closed trace step, in packages and apps alike", () => {
    const run = check("r8-trace-or-fail");
    expect(run.stderr).toContain("R8 packages/mcp/src/registry.ts");
    expect(run.stderr).toContain("R8 apps/web/lib/job.ts");
    expect(run.stderr).not.toContain("R8 packages/chat/src/engine.ts");
  });
});
