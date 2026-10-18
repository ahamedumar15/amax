import { describe, expect, it, vi } from "vitest";
import { ActionFailedError, NotPendingError } from "@amax/chat";
import { doneOutcome, outcomeOf } from "../lib/chat-outcome";

// Review rounds 6 to 8: the mapping from a server result to the card's state, every case.
describe("chat card outcomes", () => {
  it.each([
    ["a failed write that can be retried", new ActionFailedError("db down", "retry"), "open"],
    ["a failed write that can't", new ActionFailedError("forbidden", "failed"), "error"],
    ["an unknown outcome", new ActionFailedError("check first", "unknown"), "error"],
    ["already unknown", new NotPendingError("unknown"), "error"],
    ["expired", new NotPendingError("expired"), "error"],
    ["already confirmed", new NotPendingError("confirmed"), "done"],
    ["already cancelled", new NotPendingError("cancelled"), "cancelled"],
    ["already failed", new NotPendingError("failed"), "error"],
    ["an action this conversation never had", new NotPendingError(null), "error"],
    ["anything else", new Error("conversation not found"), "error"],
  ])("%s", (_n, e, state) => expect(outcomeOf(e).state).toBe(state));
});

// 057 follow-up: once the write has committed, a failed repin of saved pins never turns the card into an error.
describe("057 doneOutcome after a committed write", () => {
  const repin = { tools: ["get_release"], match: { projectKey: "CON", version: "v2.4.0" }, set: { version: "v2.4.1" } };
  const moved = { from: "/delivery/releases/CON/v2.4.0", to: "/delivery/releases/CON/v2.4.1" };
  const tag = { version: "v2.4.1", moved, repin };
  it.each([
    ["the repin throws", tag, async () => { throw new Error("db down"); }, 1, true],
    ["the repin times out (rejects later)", tag, () => new Promise((_r, no) => setTimeout(() => no(new Error("timeout")), 5)), 1, true],
    ["the repin works", tag, async () => [], 0, true],
    ["there is nothing to repin", { key: "CON-1" }, async () => { throw new Error("must not run"); }, 0, false],
  ])("%s: the card is done", async (_n, result, repinSaved, logged, carries) => {
    const log = vi.fn();
    const o = await doneOutcome("Rename a release's version tag", result, repinSaved, log);
    expect(o.state).toBe("done");
    expect(log).toHaveBeenCalledTimes(logged);
    expect(o.repin).toEqual(carries ? repin : undefined);
    expect(o.moved).toEqual(carries ? moved : undefined);
  });
});
