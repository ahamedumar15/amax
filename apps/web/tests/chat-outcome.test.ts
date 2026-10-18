import { describe, expect, it } from "vitest";
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

// 057: a committed write's card is done, and carries `moved` so the page follows a re-tag. 059 AC4:
// nothing about pins; a result that still says `repin` is ignored.
describe("059 doneOutcome after a committed write", () => {
  const moved = { from: "/delivery/releases/CON/v2.4.0", to: "/delivery/releases/CON/v2.4.1" };
  it.each([
    ["a re-tag", { version: "v2.4.1", moved }, moved],
    ["an old result with a repin", { version: "v2.4.1", moved, repin: { tools: ["get_release"] } }, moved],
    ["a new record", { key: "CON-1" }, undefined],
  ])("%s: the card is done", (_n, result, want) => {
    const o = doneOutcome("Rename a release's version tag", result);
    expect(o).toEqual({ state: "done", note: expect.any(String), ...(want ? { moved: want } : {}) });
  });
});
