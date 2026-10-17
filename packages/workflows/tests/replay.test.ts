import { describe, expect, it } from "vitest";
import { cron, defineWorkflow, NonRetryableError, sleep, step, waitForEvent } from "../src";
import { advance, emptyHistory, type History } from "../src/replay";
import { workflowRegistry } from "../src/registry";

const run = { tenantId: "t", runId: "r1", actsFor: "user:maya", input: { n: 2 } };
const once = { attempt: () => 1 };

const approval = defineWorkflow<{ n: number }>({
  name: "test.approval",
  async run(_ctx, input) {
    const doubled = await step("double", async () => input.n * 2);
    await sleep("cool-off", "1d");
    const decision = await waitForEvent<{ accepted: boolean }>("decision", { event: "agents.suggestion.decided", match: { id: "s1" } });
    return { doubled, accepted: decision?.accepted ?? false };
  },
});

describe("AC-1 workflow API", () => {
  it("replays recorded steps, then stops at the first timer and event it hasn't seen", async () => {
    const h: History = emptyHistory();
    const first = await advance(approval, run, h, once);
    expect(first).toMatchObject({ kind: "executed", name: "double", outcome: { ok: true, result: 4 } });
    h.steps.double = { status: "done", result: 4 };
    expect(await advance(approval, run, h)).toMatchObject({ kind: "blocked", command: { kind: "sleep", name: "cool-off", ms: 86_400_000 } });
    h.timers["cool-off"] = true;
    expect(await advance(approval, run, h)).toMatchObject({ kind: "blocked", command: { kind: "wait", event: "agents.suggestion.decided", match: { id: "s1" }, timeoutMs: null } });
    h.events.decision = { payload: { accepted: true } };
    expect(await advance(approval, run, h)).toEqual({ kind: "done", output: { doubled: 4, accepted: true } });
  });

  it("validates names, cron fields, time zones and the registry", () => {
    expect(() => defineWorkflow({ name: "Bad", run: async () => null })).toThrow(/module/);
    expect(() => cron({ name: "test.s", title: "S", workflow: "test.approval", cron: "* * *" })).toThrow(/five fields/);
    expect(() => cron({ name: "test.s", title: "S", workflow: "test.approval", cron: "0 6 * * *", timezone: "Mars/Olympus" })).toThrow(/time zone/);
    const s = cron({ name: "test.s", title: "S", workflow: "test.missing", cron: "0 6 * * *", timezone: "entity" });
    expect(() => workflowRegistry([{ id: "test", workflows: [approval], schedules: [s] }])).toThrow(/unknown workflow/);
    expect(() => step("x", async () => 1)).toThrow(/inside a workflow/);
  });
});

describe("AC-4 step policies", () => {
  it("times a step out, marks permanent failures, and gives a stable idempotency key", async () => {
    const keys: string[] = [];
    const wf = defineWorkflow({
      name: "test.policies",
      async run() {
        await step("slow", async ({ idempotencyKey, signal }) => {
          keys.push(idempotencyKey);
          await new Promise((r) => signal.addEventListener("abort", r));
        }, { timeout: "20ms", retry: { maxAttempts: 3 } });
      },
    });
    const slow = await advance(wf, run, emptyHistory(), once);
    expect(slow).toMatchObject({ kind: "executed", options: { timeoutMs: 20, maxAttempts: 3 }, outcome: { ok: false, retryable: true } });
    await advance(wf, run, emptyHistory(), once);
    expect(keys).toEqual(["wf:r1:slow", "wf:r1:slow"]);
    const refuse = defineWorkflow({ name: "test.refuse", run: () => step("x", async () => { throw new NonRetryableError("no"); }) });
    expect(await advance(refuse, run, emptyHistory(), once)).toMatchObject({ outcome: { ok: false, retryable: false, error: "no" } });
    const h = emptyHistory();
    h.steps.x = { status: "failed", error: "no" };
    expect(await advance(refuse, run, h)).toEqual({ kind: "failed", error: 'step "x" failed: no' });
  });
});
