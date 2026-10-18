import { describe, expect, it } from "vitest";
import { EVENTS, GOAL_STATUSES, PROFILE_SENSITIVE, RUN_STATUSES } from "../contracts";

describe("keyflow contracts", () => {
  it("AC1 AC3 the contract publishes its events, statuses and the performance class of review scores", () => {
    expect(EVENTS).toEqual({ completed: "keyflow.sync.completed", failed: "keyflow.sync.failed" });
    expect(GOAL_STATUSES).toEqual(["on-track", "at-risk", "off-track", "done"]);
    expect(RUN_STATUSES).toEqual(["completed", "completed-with-errors", "failed", "skipped"]);
    expect(PROFILE_SENSITIVE).toEqual({ reviews: "performance" });
  });
});
