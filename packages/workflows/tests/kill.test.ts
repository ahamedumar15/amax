import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { pause, pgHarness, settle, TENANT, type Harness } from "./harness";

const lines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : []);

describe.skipIf(!hasDb)("AC-2 a worker killed mid-run", () => {
  let h: Harness;
  beforeAll(async () => void (h = await pgHarness()), 60_000);
  afterAll(async () => void (await h?.close()));

  it("resumes from the last completed step on the next worker, re-running no completed step", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "amax-kill-")), "effects.log");
    const id = await h.engine.start(TENANT, "test.killable", { log }, { startedBy: "test" });
    const child = spawn("npx", ["tsx", join(__dirname, "fixtures/kill-worker.ts")], {
      cwd: join(__dirname, ".."),
      env: { ...process.env, KILL_TEST_DB: h.t.url, AMAX_KILL_TEST_HANG: "1" },
      stdio: ["ignore", "pipe", "inherit"],
      detached: true,
    });
    for (let i = 0; i < 600 && !lines(log).includes("two:start"); i++) await pause(50);
    expect(lines(log)).toEqual(["one", "two:start"]);
    process.kill(-child.pid!, "SIGKILL");
    await new Promise((r) => child.once("exit", r));
    const done = await settle(h, id, ["completed"], 30_000);
    expect(lines(log)).toEqual(["one", "two:start", "two:start", "two:done", "three"]);
    expect(done.steps.map((s) => [s.name, s.attempts])).toEqual([["one", 1], ["two", 1], ["three", 1]]);
  }, 90_000);
});
