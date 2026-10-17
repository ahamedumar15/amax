import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { engineConfig } from "../src/config";
import { count, flags } from "./fixtures/workflows";
import { admin, pause, pgHarness, settle, TENANT, type Harness } from "./harness";
import { temporalEnabled, temporalHarness } from "./temporal-harness";

const engines: [string, () => Promise<Harness>, boolean][] = [
  ["postgres", pgHarness, hasDb],
  ["temporal", temporalHarness, hasDb && temporalEnabled],
];

describe.each(engines)("AC-3 the same suite on the %s engine", (_name, make, enabled) => {
  let h: Harness;
  beforeAll(async () => void (enabled && (h = await make())), 120_000);
  afterAll(async () => void (await h?.close()), 60_000);

  it.skipIf(!enabled)("AC-2/AC-4 checkpoints steps, retries with backoff, sleeps, and never re-runs a completed step", async () => {
    const tag = `p-${h.name}`;
    flags.failOnce.add(tag);
    const id = await h.engine.start(TENANT, "test.pipeline", { tag, salary: 9000 }, { startedBy: "test", actsFor: "user:maya" });
    const failed = await settle(h, id, ["failed"]);
    expect(failed.error).toMatch(/approver missing/);
    expect(failed.steps.map((s) => [s.name, s.status, s.attempts])).toEqual([["fetch", "done", 1], ["flaky", "done", 3], ["cool-off", "done", 0], ["gate", "failed", 1]]);
    await h.engine.control(admin, id, "retry");
    const done = await settle(h, id, ["completed"]);
    expect(done.output).toEqual({ total: 20, gate: "open", actsFor: "user:maya", salary: 9000, summary: "20 found" });
    expect([count(`${tag}:fetch`), count(`${tag}:flaky`), count(`${tag}:gate`)]).toEqual([1, 3, 2]);
    expect(done.steps[0]).toMatchObject({ toolCalls: [{ tool: "crm.search", input: { q: tag }, output: { hits: 2 } }], costUsd: 0.25 });
    expect(done).toMatchObject({ actsFor: "user:maya", input: { tag, salary: 9000 }, costUsd: 0.25 });
  }, 60_000);

  it.skipIf(!enabled)("AC-1/AC-4 waits for a matching event with no time limit, or times out to null", async () => {
    const id = await h.engine.start(TENANT, "test.approval", { id: `s-${h.name}` }, { startedBy: "test" });
    await settle(h, id, ["waiting"]);
    await h.engine.signal(TENANT, "agents.suggestion.decided", { id: "someone-else", accepted: false });
    await pause(500);
    expect((await settle(h, id, ["waiting"])).steps.find((s) => s.name === "apply")).toBeUndefined();
    await h.engine.signal(TENANT, "agents.suggestion.decided", { id: `s-${h.name}`, accepted: true });
    expect((await settle(h, id, ["completed"])).output).toEqual({ accepted: true });
    expect(count(`apply:s-${h.name}`)).toBe(1);
    const late = await h.engine.start(TENANT, "test.approval", { id: `t-${h.name}`, timeout: "1s" }, { startedBy: "test" });
    expect((await settle(h, late, ["completed"])).output).toEqual({ accepted: null });
  }, 60_000);

  it.skipIf(!enabled)("AC-5 pauses, resumes and cancels runs; starting twice with a key returns the first run", async () => {
    const id = await h.engine.start(TENANT, "test.approval", { id: `c-${h.name}` }, { startedBy: "test", key: `k-${h.name}` });
    expect(await h.engine.start(TENANT, "test.approval", { id: `c-${h.name}` }, { startedBy: "test", key: `k-${h.name}` })).toBe(id);
    await settle(h, id, ["waiting"]);
    await h.engine.control(admin, id, "pause");
    await h.engine.signal(TENANT, "agents.suggestion.decided", { id: `c-${h.name}`, accepted: true });
    await pause(500);
    expect((await settle(h, id, ["paused"])).status).toBe("paused");
    await h.engine.control(admin, id, "resume");
    expect((await settle(h, id, ["completed"])).output).toEqual({ accepted: true });
    const other = await h.engine.start(TENANT, "test.approval", { id: `x-${h.name}` }, { startedBy: "test" });
    await settle(h, other, ["waiting"]);
    await h.engine.control(admin, other, "cancel");
    expect((await settle(h, other, ["cancelled"])).finishedAt).not.toBeNull();
  }, 60_000);
});

describe("AC-3 engine per deployment", () => {
  it("defaults to Postgres and needs an address for Temporal; an API key means Temporal Cloud over TLS", () => {
    expect(engineConfig({}).engine).toBe("postgres");
    expect(() => engineConfig({ AMAX_WORKFLOWS_ENGINE: "temporal" })).toThrow(/TEMPORAL_ADDRESS/);
    expect(() => engineConfig({ AMAX_WORKFLOWS_ENGINE: "inngest" })).toThrow(/postgres or temporal/);
    expect(engineConfig({ AMAX_WORKFLOWS_ENGINE: "temporal", TEMPORAL_ADDRESS: "lumen.a1b2.tmprl.cloud:7233", TEMPORAL_API_KEY: "k" }).temporal).toMatchObject({ tls: true, namespace: "default", taskQueue: "amax-workflows" });
  });
});
