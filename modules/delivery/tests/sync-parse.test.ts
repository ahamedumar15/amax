import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { readSpecclaw } from "../sync/specclaw";

describe("AC-1 specclaw parser", () => {
  const records = readSpecclaw(repoRoot);

  it("reads every change folder, archived and active", () => {
    expect(records.length).toBeGreaterThanOrEqual(39);
    const first = records.find((r) => r.number === "001")!;
    expect(first).toMatchObject({ phase: "released", approved: true, done: true, status: "done", acs: 7, tasksDone: 8, tasksTotal: 8 });
    expect(first.title).toMatch(/^Platform skeleton/);
    expect(records.find((r) => r.number === "039")).toMatchObject({ lane: "Delivery", hard: ["007", "002"], optional: ["004"] });
  });

  it("ready/blocked/claimed match scripts/queue/state.mjs on this repo", async () => {
    // The repo's own queue script is the reference (a tool, not a module import).
    const queue = await import(pathToFileURL(join(repoRoot, "scripts/queue/state.mjs")).href);
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const expected = Object.fromEntries(queue.load().map((it: { id: string }) => [it.id, queue.describe(it)]));
      const ours = Object.fromEntries(records.filter((r) => r.number in expected).map((r) => [r.number, r.status === "blocked" ? `blocked on ${r.waiting.join(", ")}` : r.status === "claimed" ? `claimed by ${r.claim}` : r.status === "ready" ? "READY" : r.status]));
      expect(ours).toEqual(expected);
    } finally {
      process.chdir(cwd);
    }
  });
});
