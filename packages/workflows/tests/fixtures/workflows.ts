import { appendFileSync } from "node:fs";
import { z } from "zod";
import { defineWorkflow, NonRetryableError, sleep, step, waitForEvent } from "../../src";

export const counts = new Map<string, number>();
export const flags = { failOnce: new Set<string>() };
const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
export const count = (key: string) => counts.get(key) ?? 0;

export const pipeline = defineWorkflow({
  name: "test.pipeline",
  title: "Pipeline",
  input: z.object({ tag: z.string(), salary: z.number().optional() }),
  sensitive: { input: { salary: "pay" }, output: { salary: "pay" } },
  async run(ctx, input) {
    const a = await step("fetch", async ({ recordToolCall, recordCost }) => {
      bump(`${input.tag}:fetch`);
      recordToolCall({ tool: "crm.search", input: { q: input.tag }, output: { hits: 2 } });
      recordCost(0.25);
      return 2;
    });
    const b = await step("flaky", async ({ attempt }) => {
      bump(`${input.tag}:flaky`);
      if (attempt < 3) throw new Error(`upstream 503 (attempt ${attempt})`);
      return a * 10;
    }, { retry: { maxAttempts: 4, initialInterval: "10ms", backoff: 1 } });
    await sleep("cool-off", "1s");
    const gate = await step("gate", async () => {
      bump(`${input.tag}:gate`);
      if (flags.failOnce.delete(input.tag)) throw new NonRetryableError("approver missing");
      return "open";
    });
    return { total: b, gate, actsFor: ctx.actsFor, salary: input.salary ?? null, summary: `${b} found` };
  },
});

export const approval = defineWorkflow({
  name: "test.approval",
  waitsFor: ["agents.suggestion.decided"],
  async run(_ctx, input: { id: string; timeout?: string }) {
    const decision = await waitForEvent<{ id: string; accepted: boolean }>("decision", { event: "agents.suggestion.decided", match: { id: input.id }, timeout: input.timeout as never });
    await step("apply", async () => void bump(`apply:${input.id}`));
    return { accepted: decision?.accepted ?? null };
  },
});

// For the kill test: the second step hangs (so the parent can SIGKILL the worker) in the child only.
export const killable = defineWorkflow({
  name: "test.killable",
  async run(_ctx, input: { log: string }) {
    const log = (line: string) => appendFileSync(input.log, `${line}\n`);
    await step("one", async () => void log("one"));
    await step("two", async () => {
      log("two:start");
      if (process.env.AMAX_KILL_TEST_HANG === "1") await new Promise(() => {});
      log("two:done");
    });
    await step("three", async () => void log("three"));
    return "ok";
  },
});

export const early = defineWorkflow({
  name: "test.early",
  waitsFor: ["test.go"],
  async run(_ctx, input: { id: string }) {
    await step("prep", async () => void bump(`prep:${input.id}`));
    return waitForEvent("go", { event: "test.go", match: { id: input.id } });
  },
});

export const counter = defineWorkflow({
  name: "test.counter",
  async run(ctx) {
    await step("a", async () => void bump(`a:${ctx.runId}`));
    await step("b", async () => void bump(`b:${ctx.runId}`));
    return { summary: "counted" };
  },
});

export const testWorkflows = [pipeline, approval, killable, early, counter];
