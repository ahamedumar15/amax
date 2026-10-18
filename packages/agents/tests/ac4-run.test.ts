import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { canSee } from "@amax/auth";
import { getRun } from "@amax/workflows/server";
import { acceptSuggestion, listSuggestions } from "../src/server";
import { MAYA, person, T, viewer } from "./setup";
import { call, runHarness, runInput } from "./run-setup";

const pay = { kind: "demo.pay", target: { type: "demo.setting", id: "pay", label: "Pay" }, title: "Pay 900", proposed: { key: "pay", value: 900 }, confidence: 0.7 };

describe.skipIf(!hasDb)("006 AC-4 agent runs", () => {
  let h: Awaited<ReturnType<typeof runHarness>>;
  beforeAll(async () => { h = await runHarness([call("get_limit", {}), call("propose_suggestion", pay), { text: "Proposed one change." }]); });
  afterAll(() => h?.t.drop());

  it("AC4 a run is a durable workflow: tool calls and cost on its steps, masked by class, waiting until a person decides", async () => {
    const runId = await h.engine.start(T, "agents.run", runInput(), { startedBy: "test", actsFor: "user:ana" });
    const waiting = await h.settle(runId, ["waiting"]);
    const think = waiting.steps.find((s) => s.name === "think")!;
    expect(think.toolCalls).toEqual([{ tool: "get_limit", input: {} }, { tool: "propose_suggestion", input: { kind: "demo.pay", title: "Pay 900" } }]);
    expect(waiting.costUsd).toBeGreaterThan(0);
    const engineer = viewer(MAYA, ["Engineer"]);
    const masked = await getRun(h.app, h.workflows, T, runId, (cls, actsFor) => canSee(engineer, cls, { ownerUserId: actsFor }));
    expect(masked!.steps.find((s) => s.name === "think")!.toolCalls).toEqual({ masked: true, class: "pay" });
    const [s] = await listSuggestions(viewer(MAYA, ["Admin"]), { bucket: "open" });
    expect(s).toMatchObject({ runId, agent: { name: "Demo check" }, proposed: { value: 900 } });
    await acceptSuggestion(person(viewer(MAYA, ["Admin"])), { id: s.id });
    await h.engine.signal(T, "agents.suggestion.decided", { suggestionId: s.id, decision: "accepted", kind: "demo.pay" });
    const done = await h.settle(runId, ["completed"]);
    expect(done.output).toMatchObject({ suggestions: [s.id], summary: "1 suggested: 1 accepted, 0 dismissed, 0 expired" });
  });
});
