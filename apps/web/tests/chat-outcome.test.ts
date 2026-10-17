import { describe, expect, it } from "vitest";
import { ActionFailedError, NotPendingError } from "@amax/chat";
import { outcomeOf } from "../lib/chat-outcome";

// Review rounds 6 and 7: the mapping from a server result to the card's state, every case.
describe("chat card outcomes", () => {
  it.each([
    ["a failed write that can be retried", new ActionFailedError("db down", true), "open"],
    ["a failed write that can't", new ActionFailedError("forbidden", false), "error"],
    ["already confirmed", new NotPendingError("confirmed"), "done"],
    ["already cancelled", new NotPendingError("cancelled"), "cancelled"],
    ["already failed", new NotPendingError("failed"), "error"],
    ["an action this conversation never had", new NotPendingError(null), "error"],
    ["anything else", new Error("conversation not found"), "error"],
  ])("%s", (_n, e, state) => expect(outcomeOf(e).state).toBe(state));
});
